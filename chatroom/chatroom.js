
var ChatRoomStates = require("./states");
var ChatRoomMessageHandler = require("./handler");
var net = require('net');

var CHAT_SERVER_HOST = "openbarrage.douyutv.com";
var CHAT_SERVER_PORT = 8601;

function ChatRoom(roomID) {
	this.state = ChatRoomStates.DISCONNECTED; // Current state
	this.roomID = roomID;
	this.groupID = "-9999"; // -9999 mean ALL. By convention this should be used by 3rd party APIs
	this.socket = null;
	this.messageHandler = null;
}

ChatRoom.prototype.changeState = function(state){
	if(this.state == state) {
		return;
	}
	this.state = state;
	switch(this.state) {
		case ChatRoomStates.DISCONNECTED: {
			break;
		}
		case ChatRoomStates.CONNECTING: {
			this.log('ChatRoom state changed to: ChatRoomStates.CONNECTING');
			break;
		}
		case ChatRoomStates.CONNECTED: {
			this.log('ChatRoom state changed to: ChatRoomStates.CONNECTED');
			// Should send LOGIN_REQ request
			this.messageHandler.sendMessage({
				type: "loginreq",
				roomid: this.roomID
			});
			break;
		}
		case ChatRoomStates.LOGGED_IN: {
			this.log('ChatRoom state changed to: ChatRoomStates.LOGGED_IN');
			this.messageHandler.sendMessage({
				type: "joingroup",
				rid: this.roomID,
				gid: this.groupID
			});
			this.changeState(ChatRoomStates.ROOM_ENTERED);
			break;
		}
		case ChatRoomStates.ROOM_ENTERED: {
			this.log('ChatRoom state changed to: ChatRoomStates.ROOM_ENTERED');
			this.startHeartBeat();
			break;
		}
		case ChatRoomStates.ERROR: {
			this.log('ChatRoom state changed to: ChatRoomStates.ERROR');
			break;
		}
	}
};

ChatRoom.prototype.connect = function(){
	this.log('ChatRoom connecting');
	var self = this;
	this.changeState(ChatRoomStates.CONNECTING);
	this.socket = new net.Socket();
	this.socket.connect(CHAT_SERVER_PORT, CHAT_SERVER_HOST, function(){
		self.log('ChatRoom server socket connected');
		self.changeState(ChatRoomStates.CONNECTED);
	});
	this.messageHandler = new ChatRoomMessageHandler(this.socket, function(message){
		switch(message.type) {
			case 'chatmsg': {
				console.log(message.nn + "(Lv." + message.level + "): " + message.txt);
				break;
			}
			case 'loginres': {
				self.changeState(ChatRoomStates.LOGGED_IN);
				break;
			}
			case 'uenter': {
				console.log('[用户消息] ' + message.nn + "(Lv." + message.level + ") 进入了直播间");
				break;
			}
			case 'spbc': {
				console.log("[礼物] " + message.sn + " 送给了 " + message.dn + " " + message.gc + " 个 " + message.gn);
				break;
			}
			case 'donateres': {
				console.log("[礼物] " + message.sui.nick + " 赠送了 " + message.ms + " 个鱼丸");
				break;
			}
			case 'srres': {
				console.log("[分享通知] " + message.nickname + " 分享了直播间，获得了 " + message.exp + " 经验");
				break;
			}
			case 'upgrade': {
				console.log("[升级消息] " + message.nn + " 升级到了 Lv." + message.level);
				break;
			}
			case 'keeplive': {
				console.log("[系统消息] 心跳发送成功");
				break;
			}
			default: {
				console.log('Unknown server message type: ' + message.type);
				console.log(JSON.stringify(message));
			}
		}

	});
	this.socket.on('close', function() {
	    self.log('ChatRoom server socket closed');
	});
	return true;
};

ChatRoom.prototype.startHeartBeat = function(){
	var self = this;
	setInterval(function(){
		self.messageHandler.sendMessage({
			type: "keeplive",
			tick: Math.floor(Date.now() / 1000)
		});
	}, 45000);
};

ChatRoom.prototype.log = function(){
	if(console){
        console.log.apply(console, arguments);
    }
};


module.exports = ChatRoom;