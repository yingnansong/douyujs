
var MAX_BUFFER_SIZE = 4 * 1024; // 4KB

var ChatRoomMessageHandlerState = {
	WAITING_PACKET_LENGTH: 0,
	WAITING_HEADER: 1,
	WAITING_BODY: 2
};

function replaceAll(str, search, replacement) {
	if(str == null || str.length <= 0) {
		return "";
	}
    return str.replace(new RegExp(search, 'g'), replacement);
};

function escape(field) {
	if(!field || field.length <= 0) {
		return "";
	}
	field = "" + field
	field = replaceAll(field, "@", "@A");
	field = replaceAll(field, "/", "@S");
	return field;
}

function unescape(field) {
	if(!field || field.length <= 0) {
		return "";
	}
	field = "" + field
	field = replaceAll(field, "@S", "/");
	field = replaceAll(field, "@A", "@");
	return field;
}

function serialize(data) {
	var kvPairs = [];
	for(var key in data) {
		if(!data.hasOwnProperty(key)) {
			continue;
		}

		kvPairs.push(escape(key) + "@=" + escape(data[key]));
	}
	return kvPairs.join("/") + "/";
}

function deserialize(raw) {
	var result = {};
	var kvPairs = raw.split("/");
	kvPairs.forEach(function(kvStr){
		var kv = kvStr.split("@=");
		if(kv.length != 2) {
			return;
		}
		var key = unescape(kv[0]);
		var value = unescape(kv[1]);
		if(value.indexOf("@=") >= 0) {
			value = deserialize(value);
		}
		result[key] = value;
	});
	return result;
}

var FIELD_LENGTH_PACKET_LENGTH = 4;
var FIELD_LENGTH_PACKET_HEADER = 8;

function ChatRoomMessagePacket() {
	this.packetLength = 0;
	this.header = null;
	this.body = null;
}

ChatRoomMessagePacket.prototype.getBodyBufferLength = function(){
	return this.packetLength - FIELD_LENGTH_PACKET_HEADER;
};

ChatRoomMessagePacket.prototype.getMessage = function(){
	if(!this.body) {
		return null;
	}
	console.log(this.body);
	console.log(this.body.charCodeAt(this.body.length - 1));
	return deserialize(this.body);
};

function ChatRoomMessageHandler(socket, onPacketReceived) {
	var self = this;
	this.socket = socket;
	this.state = ChatRoomMessageHandlerState.WAITING_PACKET_LENGTH;
	
	this.buffer = new Buffer(MAX_BUFFER_SIZE);
	this.bufferedDataLength = 0;
	this.packet = null;
	this.message = null;

	this.onPacketReceived = onPacketReceived;
	
	this.socket.setEncoding('hex');
	this.socket.on('data', function(chunk){
		// console.log("Received " + chunk.length + " bytes from socket");
		var stream = new Buffer(chunk, 'hex');
		self.consume(stream, 0);
	});
}

ChatRoomMessageHandler.prototype.sendMessage = function(message){
	var messagePlain = serialize(message);
	// console.log("Send Message, body: " + messagePlain);
	var bufferHeader = new Buffer(FIELD_LENGTH_PACKET_LENGTH + FIELD_LENGTH_PACKET_HEADER);
	var bufferBody = new Buffer(messagePlain, 'utf8');
	var totalLength = bufferBody.length + FIELD_LENGTH_PACKET_LENGTH + FIELD_LENGTH_PACKET_HEADER + 1;
	bufferHeader.writeInt32LE(totalLength - FIELD_LENGTH_PACKET_LENGTH, 0);
	bufferHeader.writeInt32LE(totalLength - FIELD_LENGTH_PACKET_LENGTH, 4);
	bufferHeader.writeInt16LE(689, 8);
	bufferHeader.writeInt16LE(0, 10);
	var sendBuffer = Buffer.concat([bufferHeader, bufferBody], totalLength);
	sendBuffer.writeInt8(0, totalLength - 1);
	var sendResult = this.socket.write(sendBuffer);
	return sendResult;
};

ChatRoomMessageHandler.prototype.onPacketPartiallyReceived = function(packet){
	if(!packet) {
		return;
	}

	var self = this;

	if(!this.message) {
		this.message = "";
	}

	this.message += packet.body;

	// Collect '\0' characters
	var splitterIndexes = [];
	var i = this.message.length - 1;
	for(; i >= 0; i--) {
		if(this.message.charCodeAt(i) == 0) {
			splitterIndexes.unshift(i);
		}
	}

	// Split them
	var lastStartIndex = 0;
	splitterIndexes.forEach(function(splitterIndex){
		var msgContent = self.message.substring(lastStartIndex, splitterIndex);
		lastStartIndex = splitterIndex + 1;
		var msgParsed = deserialize(msgContent);
		self.onPacketReceived(msgParsed);
	});

	if(lastStartIndex > 0) {
		this.message = this.message.substr(lastStartIndex);	
	}
	
};

ChatRoomMessageHandler.prototype.consume = function(chunk, offset){
	
	var self = this;

	if(offset >= chunk.length) {
		return;
	}

	switch(this.state) {
		case ChatRoomMessageHandlerState.WAITING_PACKET_LENGTH: {
			self.consumePacketLength(chunk, offset);
			break;
		}
		case ChatRoomMessageHandlerState.WAITING_HEADER: {
			self.consumeHeader(chunk, offset);
			break;
		}
		case ChatRoomMessageHandlerState.WAITING_BODY: {
			self.consumeBody(chunk, offset);
			break;
		}
	}
};

ChatRoomMessageHandler.prototype.consumePacketLength = function(chunk, offset){

	// console.log("consumePacketLength at offset " + offset);
	var self = this;

	if(offset >= chunk.length) {
		return;
	}

	var nextOffset = offset;

	var bufferLengthExpected = FIELD_LENGTH_PACKET_LENGTH;
	var bytesNeeded = bufferLengthExpected - this.bufferedDataLength;
	if(bytesNeeded <= 0) {
		this.state = ChatRoomMessageHandlerState.WAITING_HEADER;
		this.consume(chunk, nextOffset);
		return;
	}

	var bytesAvailable = chunk.length - offset;
	var bytesToRead = Math.min(bytesAvailable, bytesNeeded);
	// console.log("Trying to read " + bytesToRead + " bytes to construct packet length field");
	while(bytesToRead > 0) {
		bytesToRead -= 1;
		this.buffer.writeUInt8(chunk.readUInt8(nextOffset), this.bufferedDataLength);
		this.bufferedDataLength += 1;
		nextOffset += 1;
	}

	if(bytesAvailable >= bytesNeeded) {
		this.state = ChatRoomMessageHandlerState.WAITING_HEADER;
		// Parse Packet Length
		if(!this.packet) {
			this.packet = new ChatRoomMessagePacket();
		}
		this.packet.packetLength = this.buffer.readUInt8(0);
		// console.log('Packet Length Got: ' + this.packet.packetLength);
	}

	this.consume(chunk, nextOffset);

};

ChatRoomMessageHandler.prototype.consumeHeader = function(chunk, offset){

	// console.log("consumeHeader at offset " + offset);
	var self = this;

	if(offset >= chunk.length) {
		return;
	}

	var nextOffset = offset;

	var bufferLengthExpected = FIELD_LENGTH_PACKET_LENGTH + FIELD_LENGTH_PACKET_HEADER;
	var bytesNeeded = bufferLengthExpected - this.bufferedDataLength;
	if(bytesNeeded <= 0) {
		this.state = ChatRoomMessageHandlerState.WAITING_BODY;
		this.consume(chunk, nextOffset);
		return;
	}

	var bytesAvailable = chunk.length - offset;
	var bytesToRead = Math.min(bytesAvailable, bytesNeeded);
	// console.log("Trying to read " + bytesToRead + " bytes to construct packet header");
	while(bytesToRead > 0) {
		bytesToRead -= 1;
		this.buffer.writeUInt8(chunk.readUInt8(nextOffset), this.bufferedDataLength);
		this.bufferedDataLength += 1;
		nextOffset += 1;
	}

	if(bytesAvailable >= bytesNeeded) {
		this.state = ChatRoomMessageHandlerState.WAITING_BODY;
		// Parse Header
		if(!this.packet.header) {
			this.packet.header = {
				msgLength: 0,
				msgType: 0
			}
		}
		this.packet.header.msgLength = this.buffer.readUInt8(FIELD_LENGTH_PACKET_LENGTH);
		this.packet.header.msgType = this.buffer.readInt16LE(FIELD_LENGTH_PACKET_LENGTH + 4);
		// console.log('Packet Message Length Got: ' + this.packet.header.msgLength);
		// console.log('Packet Message Type Got: ' + this.packet.header.msgType);
	}

	this.consume(chunk, nextOffset);
		
};

ChatRoomMessageHandler.prototype.consumeBody = function(chunk, offset){

	// console.log("consumeBody at offset " + offset);
	var self = this;

	if(offset >= chunk.length) {
		return;
	}

	var nextOffset = offset;

	var bufferLengthExpected = FIELD_LENGTH_PACKET_LENGTH + this.packet.packetLength;
	var bytesNeeded = bufferLengthExpected - this.bufferedDataLength;
	if(bytesNeeded <= 0) {
		this.state = ChatRoomMessageHandlerState.WAITING_PACKET_LENGTH;
		this.consume(chunk, nextOffset);
		return;
	}

	var bytesAvailable = chunk.length - offset;
	var bytesToRead = Math.min(bytesAvailable, bytesNeeded);
	// console.log("Trying to read " + bytesToRead + " bytes to construct packet body");
	while(bytesToRead > 0) {
		bytesToRead -= 1;
		this.buffer.writeUInt8(chunk.readUInt8(nextOffset), this.bufferedDataLength);
		this.bufferedDataLength += 1;
		nextOffset += 1;
	}

	// console.log('Packet body read complete.');

	if(bytesAvailable >= bytesNeeded) {
		this.state = ChatRoomMessageHandlerState.WAITING_PACKET_LENGTH;
		// Parse Body
		// console.log('Constructing body');
		this.packet.body = this.buffer.slice(FIELD_LENGTH_PACKET_LENGTH + FIELD_LENGTH_PACKET_HEADER, this.bufferedDataLength).toString('utf8');
		// console.log('Constructed body: ' + this.packet.body);
		this.onPacketPartiallyReceived(this.packet);
		this.packet = null;
		this.bufferedDataLength = 0;
	}

	this.consume(chunk, nextOffset);
		
};

module.exports = ChatRoomMessageHandler;