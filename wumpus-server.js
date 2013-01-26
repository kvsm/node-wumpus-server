var net = require('net');
var sys = require('sys');

var clients = [];

var WELCOME       = "\nWelcome to HUNT THE WUMPUS Global Edition!\nPlease enter your name: \n";
var JOINED        = " joined the game!\n";
var LEFT          = " left the game.\n";
var INTRO         = 
"===============================================================================\n\n" +
";BHOW TO PLAY:\n\n" +
";WIn this game, you must enter the lair and hunt the ;Rdeadly Wumpus;W! Score points\n" +
"by shooting arrows into the Wumpus and other players. Lose points for getting\n" +
"shot by players or eaten by the Wumpus.\n\n" +
"===============================================================================\n\n" +
"Press enter to begin...\n";
var ROOM_DESC         = "You are in a dark cave in the lair.";
var PROMPT            = "\nYour move?";

var COMMAND_NOT_FOUND = "Sorry, I didn't understand that.";
var ENTER_MOVE_DIR    = "You must enter a direction (eg. MOVE NORTH).";
var ENTER_VALID_DIR   = "That's not a valid direction (NORTH, SOUTH, EAST, WEST).";
var WAITING_FOR_PLAYERS = "\nWaiting for other players...";

var S_HEARTBEAT = 0;

var C_W = ";W";
var C_Y = ";Y";
var C_R = ";R";
var C_G = ";G";
var C_B = ";B";
var SOUND = ";S";
var RICH_TAG = "@#";

var DIRS = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
var ROOM_MAX_X = 8;
var ROOM_MAX_Y = 8;
var wumpus = {};

net.createServer( function (client) {
  if (clients.length == 0) {
    initGame();
  }
  client.addr = client.remoteAddress + ':' + client.remotePort;
  console.log('Client ' + client.addr + ' connected');
  send(WELCOME, client);
  client.ready = false;

  client.on('data', function (data) {
    console.log('Client: ' + client.addr + ' Data: ' + data);
    if (clients.indexOf(client) == -1) {
      if (!client.ready) {
        init(client, data);
        broadcast(C_Y + client.name + C_W + JOINED, client);
        send(INTRO, client);
        client.ready = true;
      } else {
        joinGame(client);
        client.hasCommand = false;
      }
    } else {
      var command = data.toString().replace('\r\n','');
      parse(command);
    }
  });
  
  client.on('end', function () {
    clients.splice(clients.indexOf(client), 1);
    if ( !(typeof(client.name) == "undefined") ) {
      broadcast(C_Y + client.name + C_W + LEFT);
    }
    console.log('Player ' + client.name + ' (' + client.addr + ') diconnected');
  });
  
  function init(client, data) {
    var name = data.toString().replace('\r\n','');
    if (name.startsWith(RICH_TAG)) {
      client.name = name.substring(2);
      client.isUsingRichClient = true;
    } else {
      client.name = name;
      client.isUsingRichClient = false;
    }
    console.log('Client ' + client.addr + ' identified as ' +
        client.name + ', using rich client: ' + client.isUsingRichClient);
  }
  
  function joinGame(client) {
    var location = getRandomLocation(true);
    client.location = location;
    clients.push(client);
    send(SOUND + S_HEARTBEAT, client);
    send(ROOM_DESC, client);
    send(PROMPT, client);
  }
  
  function parse(command) {
    var cmdArray = command.split(" ");
    switch(cmdArray[0].toUpperCase()) {
      case 'MOVE':
        if (cmdArray[1] == undefined) {
          send(ENTER_MOVE_DIR, client);
        } else if (DIRS.indexOf(cmdArray[1].toUpperCase()) == -1) {
          send(ENTER_VALID_DIR, client);
        } else {
          client.command = cmdArray;
          client.hasCommand = true;
        }
        break;
      default:
        send(COMMAND_NOT_FOUND, client);
    }
    if (client.hasCommand) {
      var allReady = true;
      for (var c in clients) {
        if (!clients[c].hasCommand) {
          allReady = false;
        }
      }
      if (!allReady) {
        send(WAITING_FOR_PLAYERS, client);
      } else {
        processCommands();
      }
    } else {
      send(PROMPT, client);
    }
  }
  
  function processCommands() {
    for (var i in clients) {
      var c = clients[i];
      c.hasCommand = false;
      switch(c.command[0].toUpperCase()) {
        case 'MOVE':
          movePlayer(c);
          break;
      }
    }
  }
  
  function movePlayer(client) {
    console.log(client.location);
    var loc = client.location;
    switch(client.command[1].toUpperCase()) {
      case 'NORTH':
        client.location.y++;
        break;
      case 'SOUTH':
        client.location.y--;
        break;
      case 'EAST':
        client.location.x++;
        break;
      case 'WEST':
        client.location.x--;
        break;
    }
    console.log(client.location);
  }
  
  function send(message, client) {
    if (!message.endsWith('\n')) {
      message = message + '\n';
    }
    if (client.isUsingRichClient) {
      client.write(message);
    } else {
      message = stripCodes(message);
      if (message !== null) {
        client.write(message);
      }
    }
  }
  
  function broadcast(message, sender) {
    clients.forEach(function (client) {
      if (client === sender) return;
      send(message, client);
    });
  }
  
  function stripCodes(message) {
    if (message.startsWith(SOUND)) {
      return null;
    }
    var re = new RegExp(';\\w', 'g');
    return message.replace(re,'');
  }
  
  function initGame() {
    console.log("Initialising game...");
    console.log("Placing Wumpus...");
    wumpus.location = getRandomLocation(false);
    console.log("Wumpus placed at " + sys.inspect(wumpus.location));
  }

  function checkClientCommands() {
    for (i in clients) {
      if (!clients[i].hasCommand) return false;
    }
    return true;
  }

  function getRandomLocation(shouldBeEmpty) {
    var location = {};
    location.x = Math.floor(Math.random()*ROOM_MAX_X);
    location.y = Math.floor(Math.random()*ROOM_MAX_Y);
    if (shouldBeEmpty && !roomIsEmpty(location)) {
      return getRandomLocation(shouldBeEmpty);
    } else {
      return location;
    }
  }

  function roomIsEmpty(loc) {
    for (i in clients) {
      var c = clients[i];
      if (c.location.x == loc.x && c.location.y == loc.y) return false;
    }
    if (wumpus.location.x == loc.x && wumpus.location.y == loc.y) return false;
    return true;
  }
  
}).listen(5000);

String.prototype.startsWith = function(prefix) {
    return this.substring(0, prefix.length) === prefix;
};

String.prototype.endsWith = function(suffix) {
    return this.indexOf(suffix, this.length - suffix.length) !== -1;
};
