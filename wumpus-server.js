var net = require('net');
var sys = require('sys');

var clients = [];
var broadcasts = [];
var targets = [];

var WELCOME       = "\nWelcome to HUNT THE WUMPUS Global Edition!\nPlease enter your name: \n";
var JOINED        = " joined the game!\n";
var LEFT          = " left the game.\n";
var INTRO         = 
"===============================================================================\n\n" +
";BHOW TO PLAY:\n\n" +
";WIn this game, you must enter the lair and hunt the ;Rdeadly Wumpus;W! ;GScore;W points\n" +
"by shooting the Wumpus and other players with your shotgun. ;RLose;W points for getting\n" +
"shot by players or eaten by the Wumpus.\n\n" +
"===============================================================================\n\n" +
"Press enter to begin...\n";
var ROOM_DESC         = "You are in a dark cave in the lair.";
var PROMPT            = "\nYour move?";

var COMMAND_NOT_FOUND = "Sorry, I didn't understand that.";
var ENTER_MOVE_DIR    = "You must enter a direction (eg. MOVE NORTH).";
var ENTER_SHOOT_DIR    = "You must enter a direction (eg. SHOOT NORTH).";
var ENTER_VALID_DIR   = "That's not a valid direction (NORTH, SOUTH, EAST, WEST).";
var INVALID_MOVE      = "You can't move in that direction.";
var INVALID_SHOT      = "You can't shoot in that direction.";
var WAITING_FOR_PLAYERS = "\nWaiting for other players...";
var MOVED             = "You move ";
var KILLED_BY_WUMPUS  = "You have been ;Peaten;W by the ;RWumpus;W!";
var KILLED_BY_PLAYER  = "You were killed by ";
var PLAYER_KILLED_BY_WUMPUS = " was eaten by the Wumpus!";
var RESPAWN           = "Press enter to respawn...";

var WUMPUS_FAR        = "There is a whiff of Wumpus in the air...";
var WUMPUS_MID        = "You smell a Wumpus nearby.";
var WUMPUS_NEAR       = "This place stinks of Wumpus!";
var WUMPUS_HERE       = 
"The majestic Wumpus, fangs dripping with ;Rblood;W, stands before you."

var S_HEARTBEAT_LOUD  = 0;
var S_HEARTBEAT_MED   = 1;
var S_HEARTBEAT_QUIET = 2;
var S_START           = 3;
var S_DEATH           = 4;
var S_GUNSHOT         = 5;

var C_W = ";W";
var C_Y = ";Y";
var C_R = ";R";
var C_G = ";G";
var C_B = ";B";
var C_P = ";P";
var SOUND = ";S";
var ROOM_RESET = ";Z";
var CLS = ";U";
var RICH_TAG = "@#";

var DIRS = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
var ROOM_MAX_X = 3;
var ROOM_MAX_Y = 3;
var WUMPUS_DEATH = 0;
var PLAYER_DEATH = 1;
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
        send(INTRO, client);
        client.ready = true;
      } else {
        queueBroadcast(C_Y + client.name + C_W + JOINED, client);
        joinGame(client);
        client.hasCommand = false;
      }
    } else {
      if (!client.dead) {
        var command = data.toString().replace('\r\n','');
        parse(command);
      } else {
        joinGame(client);
      }
    }
  });
  
  client.on('end', function () {
    clients.splice(clients.indexOf(client), 1);
    if ( !(typeof(client.name) == "undefined") ) {
      queueBroadcast(C_Y + client.name + C_W + LEFT);
    }
    var allReady = true;
    for (var c in clients) {
      if (!clients[c].hasCommand) {
        allReady = false;
      }
    }
    if (allReady) {
      processCommands();
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
    client.dead = false;
    //var location = getRandomLocation(true);
    var location = { x: ROOM_MAX_X, y: ROOM_MAX_Y};
    client.location = location;
    clients.push(client);
    resolveTurn(client);
    send(SOUND + S_START, client);
    send(PROMPT, client);
  }
  
  function parse(command) {
    var cmdArray = command.split(" ");
    switch(cmdArray[0].toUpperCase()) {
      case 'MOVE':
        if (!client.hasCommand) {
          if (cmdArray[1] == undefined) {
            send(ENTER_MOVE_DIR, client);
          } else if (DIRS.indexOf(cmdArray[1].toUpperCase()) == -1) {
            send(ENTER_VALID_DIR, client);
          } else {
            if (checkBoundaries(cmdArray[1].toUpperCase())) {
              client.command = cmdArray;
              client.hasCommand = true;
            } else {
              send(INVALID_MOVE, client);
            }
          }
        }
        break;
      case 'SHOOT':
        if (!client.hasCommand) {
          if (cmdArray[1] == undefined) {
            send(ENTER_SHOOT_DIR, client);
          } else if (DIRS.indexOf(cmdArray[1].toUpperCase()) == -1) {
            send(ENTER_VALID_DIR, client);
          } else {
            if (checkBoundaries(cmdArray[1].toUpperCase())) {
              client.command = cmdArray;
              client.hasCommand = true;
            } else {
              send(INVALID_SHOT, client);
            }
          }
        }
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
        case 'SHOOT':
          shoot(c);
          break;
      }
      resolveTurn(c);
      sendQueuedBroadcasts();
      if (client.dead) {
        send(RESPAWN, c);
      } else {
        send(PROMPT, c);
      }
    }
  }
  
  function checkBoundaries(direction) {
    switch(direction) {
      case 'NORTH':
        if (client.location.y + 1 > ROOM_MAX_Y) {
          return false;
        }
        break;
      case 'SOUTH':
        if (client.location.y - 1 < 0) {
          return false;
        }
        break;
      case 'EAST':
        if (client.location.x + 1 > ROOM_MAX_X) {
          return false;
        }
        break;
      case 'WEST':
        if (client.location.x - 1 < 0) {
          return false;
        }
        break;
    }
    return true;
  }
  
  function movePlayer(client) {
    console.log(client.name + ' old position: ' + sys.inspect(client.location));
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
    console.log(client.name + ' new position: ' + sys.inspect(client.location));
    send('\n' + C_G + MOVED + client.command[1] + '.', client);
  }
  
  function shoot(client) {
    var loc = {};
    loc.x = client.location.x;
    loc.y = client.location.y;
    switch(client.command[1].toUpperCase()) {
      case 'NORTH':
          loc.y++;
        break;
      case 'SOUTH':
          loc.y--;
        break;
      case 'EAST':
          loc.x++;
        break;
      case 'WEST':
          loc.x--;
        break;
    }
    targets[loc.x][loc.y] = client;
    queueBroadcast(SOUND + S_GUNSHOT, null);
  }
  
  function killPlayer(client, cause, killer) {
    clients.pop(client);
    client.dead = true;
    send(SOUND + S_DEATH, client);
    switch(cause) {
      case WUMPUS_DEATH:
        send(CLS, client);
        send(WUMPUS_HERE, client);
        send(KILLED_BY_WUMPUS, client);
        queueBroadcast(C_Y + client.name + C_W + PLAYER_KILLED_BY_WUMPUS, client);
        break;
      case PLAYER_DEATH:
        send(CLS, client);
        send(KILLED_BY_PLAYER + C_Y + killer.name + C_W + '!', client);
        break;
    }
    var allReady = true;
    for (var c in clients) {
      if (!clients[c].hasCommand) {
        allReady = false;
      }
    }
    if (allReady) {
      processCommands();
    }
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
  
  function sendQueuedBroadcasts() {
    for (var i in broadcasts) {
      broadcast(broadcasts[i].text, broadcasts[i].sender);
    }
    broadcasts = [];
  }
  
  function queueBroadcast(message, sender) {
    var post = {};
    post.text = message;
    post.sender = sender;
    broadcasts.push(post);
  }
  
  function stripCodes(message) {
    if (message.startsWith(SOUND)) {
      return null;
    }
    var re = new RegExp(';\\w', 'g');
    return message.replace(re,'');
  }
  
  function initGame() {
    broadcasts = [];
    console.log("Initialising game...");
    console.log("Placing Wumpus...");
    //wumpus.location = getRandomLocation(false);
    var loc = {};
    loc.x = loc.y = 0;
    wumpus.location = loc;
    console.log("Wumpus placed at " + sys.inspect(wumpus.location));
    resetTargets();
  }
  
  function resetTargets() {
    console.log("Resetting targets...");
    for (var x = 0; x <= ROOM_MAX_X; x++) {
      targets[x] = [];
    }
  }
  
  function resolveTurn(client) {
    send(ROOM_RESET, client);
    send(ROOM_DESC, client);
    var shooter = targets[client.location.x][client.location.y];
    if (shooter !== undefined) {
      targets[client.location.x][client.location.y] = undefined;
      killPlayer(client, PLAYER_DEATH, shooter);
    } else {
        
      var dx = wumpus.location.x - client.location.x; 
      var dy = wumpus.location.y - client.location.y;
      dx = dx < 0 ? dx * -1 : dx;
      dy = dy < 0 ? dy * -1 : dy;
      var sqdist = dx*dx + dy*dy;
      if (sqdist == 0) {
        killPlayer(client, WUMPUS_DEATH);
      } else if (sqdist <= 1) {
        var soundfile = S_HEARTBEAT_LOUD;
        send(SOUND + soundfile, client);
        send(WUMPUS_NEAR, client);
      } else if (sqdist <= 4) {
        var soundfile = S_HEARTBEAT_MED;
        send(SOUND + soundfile, client);
        send(WUMPUS_MID, client);
      } else if (sqdist <= 9) {
        var soundfile = S_HEARTBEAT_QUIET;
        send(SOUND + soundfile, client);
        send(WUMPUS_FAR, client);
      }
    }
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
