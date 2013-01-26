var net = require('net');
var clients = [];
var rooms = [];

var WELCOME       = "\nWelcome to WUMPUS IN MA HOOSE!\nPlease enter your name: \n";
var JOINED        = " joined the game!\n";
var LEFT          = " left the game.\n";
var INTRO         = 
"===============================================================================\n\n" +
";BHOW TO PLAY:\n\n" +
";WIn this game, you must enter a maze and hunt the ;Rdeadly Wumpus;W! Score points\n" +
"by shooting arrows into the Wumpus and other players. Lose points for getting\n" +
"shot by players or eaten by the Wumpus.\n\n" +
"===============================================================================\n\n" +
"Press enter to begin...\n";

var S_HEARTBEAT = 0;

var C_W = ";W";
var C_Y = ";Y";
var C_R = ";R";
var C_G = ";G";
var C_B = ";B";
var SOUND = ";S";


net.createServer( function (client) {
  client.addr = client.remoteAddress + ':' + client.remotePort;
  console.log('Client ' + client.addr + ' connected\n');
  send(WELCOME, client);
  client.ready = false;

  client.on('data', function (data) {
    if (clients.indexOf(client) == -1) {
      if (!client.ready) {
        init(client, data);
        broadcast(C_Y + client.name + C_W + JOINED, client);
        send(INTRO, client);
        client.ready = true;
      } else {
        joinGame(client);
      }
    } else {
      
    }
  });
  
  client.on('end', function () {
    clients.splice(clients.indexOf(client), 1);
    if ( !(typeof(client.name) == "undefined") ) {
      broadcast(C_Y + client.name + C_W + LEFT);
    }
    console.log('Player ' + client.name + ' (' + client.addr + ') diconnected\n');
  });
  
  function init(client, data) {
    var name = data.toString().replace('\r\n','');
    if (name.substring(0, 2) === '@#') {
      client.name = name.substring(2);
      client.isUsingRichClient = true;
    } else {
      client.name = name;
      client.isUsingRichClient = false;
    }
    console.log('Client ' + client.addr + ' identified as ' +
        client.name + ', using rich client: ' + client.isUsingRichClient + '\n');
  }
  
  function joinGame(client) {
    var location = getRandomLocation(true);
    console.log(location);
    if (rooms[location.x] == undefined) {
      rooms[location.x] = [];
    }
    rooms[location.x][location.y] = client;
    clients.push(client);
    send(SOUND + S_HEARTBEAT, client);
  }
  
  function getRandomLocation(shouldBeEmpty) {
    var location = {};
    location.x = Math.floor(Math.random()*64);
    location.y = Math.floor(Math.random()*64);
    if (shouldBeEmpty && !isRoomEmpty(location)) {
      return getRandomLocation(shouldBeEmpty);
    } else {
      return location;
    }
  }
  
  function isRoomEmpty(location) {
    if (rooms[location.x] !== undefined && rooms[location.x][location.y] !== undefined ) {
      return false;
    } else {
      return true;
    }
  }
  
  function send(message, client) {
    if (!message.endsWith('\n')) {
      message = message + '\n';
    }
    if (client.isUsingRichClient) {
      client.write(message);
    } else {
      client.write(stripCodes(message));
    }
  }
  
  function broadcast(message, sender) {
    clients.forEach(function (client) {
      if (client === sender) return;
      send(message, client);
    });
  }
  
  function stripCodes(message) {
    var re = new RegExp(';\\w', 'g');
    return message.replace(re,'');
  }
  
}).listen(5000);

String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};
