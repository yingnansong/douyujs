// var should = require('chai').should();
// var DouyuAPI = require('../index');
// var room = new DouyuAPI.ChatRoom("584854");
// room.connect();

// describe("#initialize", function(){
// 	it('starts up correctly', function(){
// 		var room = new DouyuAPI.ChatRoom("584854");
// 		room.connect();
// 	});
// });

var DouyuAPI = require('../index');
var room = new DouyuAPI.ChatRoom("3484");
room.connect();

