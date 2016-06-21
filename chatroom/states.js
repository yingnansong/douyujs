// Definition of room states
var ChatRoomStates = {
	DISCONNECTED: 0,
	CONNECTING: 1, // Socket connecting
	CONNECTED: 2, // Socket connected but not logged in yet
	LOGGED_IN: 3, // Socket connected and user logged in, but room not entered yet
	ROOM_ENTERED: 4, // Room entered. This is the expected state when the client is working correctly
	ERROR: -1 // Error
};

module.exports = ChatRoomStates;