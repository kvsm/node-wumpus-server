var net = require('net');
var sys = require('sys');

var clients = [];
var broadcasts = [];

var WELCOME       = "\nWelcome to HUNT THE WUMPUS Global Edition!\nPlease enter your name: \n";
var JOINED        = " joined the game!\n";
var LEFT          = " left the game.\n";
var INTRO         = 
"===============================================================================\n\n" +
";BHOW TO PLAY:\n\n" +
";WIn this game, you must enter the lair and hunt the ;Rdeadly Wumpus;W!\n" + 
";GScore;W points by shooting the ;RWumpus;W and other ;Yplayers;W with your shotgun.\n" +
";RLose;W points for getting shot by ;Yplayers;W or eaten by the ;RWumpus;W.\n\n" +
";BCOMMANDS:\n\n" +
";YMOVE <DIRECTION>;W  - Move in the specified direction.\n" +
";YSHOOT <DIRECTION>;W - Shoot in the specified direction.\n\n" +
"You may also use the ;YARROW KEYS;W to move and ;YSHIFT + ARROW KEYS;W to shoot.\n\n" +
"===============================================================================\n\n" +
"Press enter to begin...\n";
var ROOM_DESC         = "You are in a dark cave in the lair.";
var PROMPT            = "\nYour move?";

var COMMAND_NOT_FOUND = "Sorry, I didn't understand that.";
var ENTER_MOVE_DIR    = ";RYou must enter a direction (eg. MOVE NORTH).";
var ENTER_SHOOT_DIR    = ";RYou must enter a direction (eg. SHOOT NORTH).";
var ENTER_VALID_DIR   = ";RThat's not a valid direction (NORTH, SOUTH, EAST, WEST).";
var INVALID_MOVE      = ";RYou can't move in that direction.";
var INVALID_SHOT      = ";RYou can't shoot in that direction.";
var WAITING_FOR_PLAYERS = "\n;GWaiting for other players to make their move...";
var MOVED             = "You move ";
var SHOT              = "You fire your shotgun to the ";
var KILLED_BY_WUMPUS  = "You have been ;Peaten;W by the ;RWumpus;W!";
var KILLED_BY_PLAYER  = "You were killed by ";
var PLAYER_KILLED_BY_WUMPUS = " was eaten by the ;RWumpus;W!";
var KILLED_BY         = " was killed by ";
var SHOT_THE_WUMPUS   = " shot the ;RWumpus;W!";
var STANDING_HERE     = " is standing here.";
var RESPAWN           = "Press enter to respawn...";

var WUMPUS_FAR        = ";PThere is a whiff of Wumpus in the air...";
var WUMPUS_MID        = ";PYou smell a Wumpus nearby.";
var WUMPUS_NEAR       = ";PThis place stinks of Wumpus!";
var WUMPUS_HERE       = 
"The majestic Wumpus, fangs dripping with ;Rblood;W, stands before you.";
var WUMPUS_SNEAK      =
"You hear a sudden noise and turn around, but it is too late. This time, the\n" +
";RWumpus;W has hunted ;Yyou;W!";

var S_HEARTBEAT_LOUD  = 0;
var S_HEARTBEAT_MED   = 1;
var S_HEARTBEAT_QUIET = 2;
var S_START           = 3;
var S_DEATH           = 4;
var S_GUNSHOT         = 5;
var S_WUMPUS_DEATH    = 6;
var S_FOOTSTEPS      = 8;
var S_CANNOT_MOVE     = 9;

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
var PLAYER_MOVED_WUMPUS = 0;
var PLAYER_DEATH        = 1;
var WUMPUS_MOVED_PLAYER = 2;
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
        dynamicAdjust();
        
        init(client, data);
        send(INTRO, client);
        client.ready = true;
      } else {
        queueBroadcast(C_Y + client.name + C_W + JOINED, client);
        joinGame(client);
      }
    } else {
      if (!client.dead) {
        var command = data.toString().replace('\r\n','');
        parse(command);
        if (client.hasCommand) {
          if (!checkClientCommands()) {
            send(WAITING_FOR_PLAYERS, client);
          } else {
            for (var i in clients) {
              var c = clients[i];
              if (!c.dead) {
                processCommands(c);
              }
            }
            // everything else after all client commands processed
            var shooter = checkShot(wumpus);
            if (shooter != false) {
              send('You' + SHOT_THE_WUMPUS + C_B + ' Way to go!', shooter);
              broadcast(C_Y + shooter.name + C_W + SHOT_THE_WUMPUS, shooter);
              broadcast(SOUND + S_GUNSHOT);
              broadcast(SOUND + S_WUMPUS_DEATH);
              resetGame();
            } else {
              for (var i in clients) {
                var c = clients[i];
                if (!c.dead) {
                  resolveTurn(c);
                }
              }
              sendQueuedBroadcasts();
              sendQueuedClientMessages();
              resetTargets();
              moveWumpus();
              for (var i in clients) {
                var c = clients[i];
                if (c != undefined && !c.dead) {
                  send(PROMPT, c);
                }
              } 
            }
          }
        } else {
          send(PROMPT, client);
        }
      } else {
        joinGame(client);
      }
    }
  });
  
  client.on('end', function () {
    clients.splice(clients.indexOf(client), 1);
    console.log('Player ' + client.name + ' (' + client.addr + ') diconnected');
    if ( !(typeof(client.name) == "undefined") ) {
      queueBroadcast(C_Y + client.name + C_W + LEFT);
    }
    client = undefined;
    if (checkClientCommands()) {
      for (var i in clients) {
        var c = clients[i];
        if (!c.dead) {
          processCommands(c);
        }
      }
    }
    dynamicAdjust();
  });
  
  function dynamicAdjust() {
      ROOM_MAX_X = ROOM_MAX_Y = 8 + Math.floor((clients.length + 1) * 0.2);
        
        for (var i in clients) {
              var c = clients[i];
              if (c.location.x > ROOM_MAX_X) {
                  ROOM_MAX_X = c.location.x;
              }
              if (c.location.y > ROOM_MAX_Y) {
                  ROOM_MAX_Y = c.location.y;
              }
        }
        
        if (wumpus.location.x > ROOM_MAX_X) {
          ROOM_MAX_X = wumpus.location.x;
        }
        if (wumpus.location.y > ROOM_MAX_Y) {
          ROOM_MAX_Y = wumpus.location.y;
        }        
        console.log("dynamicmap: "+clients.length+" "+ROOM_MAX_X+","+ROOM_MAX_Y);
        
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
  
  function checkClientCommands() {
    for (var i in clients) {
      if (!clients[i].hasCommand && !clients[i].dead) return false;
    }
    return true;
  }
  
  function checkShot(victim) {
    for (var i in clients) {
      var c = clients[i];
      if (c.target.x == victim.location.x && c.target.y == victim.location.y) {
        return c;
      }
    }
    return false;
  }
  
  function eatenByWumpus(client) {
    var dx = wumpus.location.x - client.location.x; 
    var dy = wumpus.location.y - client.location.y;
    abs_dx = dx < 0 ? dx * -1 : dx;
    abs_dy = dy < 0 ? dy * -1 : dy;
    var sqdist = abs_dx*abs_dx + abs_dy*abs_dy;
    if (sqdist == 0) {
      return true;
    } else if (sqdist <= 1) {
      var soundfile = S_HEARTBEAT_LOUD;
      send(SOUND + soundfile+"|"+dx+","+dy, client);
      send(WUMPUS_NEAR, client);
      return false;
    } else if (sqdist <= 4) {
      var soundfile = S_HEARTBEAT_MED;
      send(SOUND + soundfile+"|"+dx+","+dy, client);
      send(WUMPUS_MID, client);
      return false;
    } else if (sqdist <= 9) {
      var soundfile = S_HEARTBEAT_QUIET;
      send(SOUND + soundfile+"|"+dx+","+dy, client);
      send(WUMPUS_FAR, client);
      return false;
    }
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
  
  function initGame() {
    broadcasts = [];
    ROOM_MAX_X = ROOM_MAX_Y = 8 + Math.floor((clients.length + 1) * 0.2);
    console.log("Initialising game...");
    console.log("Placing Wumpus...");
    wumpus.location = getRandomLocation(false);
    console.log("Wumpus placed at " + sys.inspect(wumpus.location));
    resetTargets();
  }
  
  function joinGame(client) {
    client.hasCommand = false;
    client.dead = false;
    client.target = {};
    client.queue = [];
    var location = getRandomLocation(true);
    client.location = location;
    console.log(client.name + ' added at ' + sys.inspect(location));
    if (clients.indexOf(client) == -1) {
      clients.push(client);
    }
    resolveTurn(client);
    send(SOUND + S_START, client);
    send(PROMPT, client);
  }
  
  function killPlayer(client, cause, killer) {
    client.dead = true;
    client.location = {};
    send(SOUND + S_DEATH, client);
    switch(cause) {
      case PLAYER_MOVED_WUMPUS:
        send(CLS, client);
        send(WUMPUS_HERE, client);
        send(KILLED_BY_WUMPUS, client);
        broadcast(C_Y + client.name + C_W + PLAYER_KILLED_BY_WUMPUS, client);
        break;
      case PLAYER_DEATH:
        send(CLS, client);
        send(KILLED_BY_PLAYER + C_Y + killer.name + C_W + '!', client);
        broadcast(C_Y + client.name + C_W + KILLED_BY +
            C_Y + killer.name + C_W + '!', client);
        send(SOUND + S_GUNSHOT, client);
        break;
      case WUMPUS_MOVED_PLAYER:
        send(CLS, client);
        send(WUMPUS_SNEAK, client);
        send(KILLED_BY_WUMPUS, client);
        broadcast(C_Y + client.name + C_W + PLAYER_KILLED_BY_WUMPUS, client);
        break;
    }
    send(RESPAWN, client);
  }
  
  function movePlayer(client) {
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
  
  function moveWumpus() {
    if (Math.random() > 0.65) {
      var loc = {};
      var moved = false;
      while(!moved) {
        loc.x = wumpus.location.x;
        loc.y = wumpus.location.y;
        var dir = Math.floor(Math.random()*4);
        switch(dir) {
          case 0:
            loc.y++;
            break;
          case 1:
            loc.y--;
            break;
          case 2:
            loc.x++;
            break;
          case 3:
            loc.x--;
            break;
        }
        if (loc.x <= ROOM_MAX_X && loc.x >= 0 && loc.y <= ROOM_MAX_Y && loc.y >= 0) {
          moved = true;
          wumpus.location = loc;
        }
      }
      console.log("Wumpus has moved to " + sys.inspect(wumpus.location));
      for (var i in clients) {
        var c = clients[i];
        if (c.location.x == wumpus.location.x && c.location.y == wumpus.location.y) {
          killPlayer(c, WUMPUS_MOVED_PLAYER);
        }
      }
    }
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
              send(SOUND + S_CANNOT_MOVE, client);
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
        break;
      default:
        send(COMMAND_NOT_FOUND, client);
    }
  }
  
  function processCommands(client) {
    switch(client.command[0].toUpperCase()) {
      case 'MOVE':
        movePlayer(client);
        break;
      case 'SHOOT':
        shoot(client);
        break;
    }
  }
  
  function resetGame() {
    initGame();
    for (var i in clients) {
      var c = clients[i];
      joinGame(c);
    }
  }
  
  function resetTargets() {
    console.log("Resetting targets...");
    for (var i in clients) {
      var c = clients[i];
      c.target = {};
    }
  }
  
  function resolveTurn(client) {
    send(ROOM_RESET, client);
    send(ROOM_DESC, client);
    var shooter = checkShot(client)
    if (shooter != false) {
      killPlayer(client, PLAYER_DEATH, shooter);
    } else if (eatenByWumpus(client)) {
      killPlayer(client, PLAYER_MOVED_WUMPUS);
    }
    for (var i in clients) {
      var c = clients[i];
      if (c !== client) {
        if (client.location.x == c.location.x && client.location.y == c.location.y) {
          send(C_Y + c.name + C_W + STANDING_HERE, client);
        } else {
            // check if we should play footsteps (neighbouring)
            var dx = c.location.x - client.location.x; 
            var dy = c.location.y - client.location.y;
            abs_dx = dx < 0 ? dx * -1 : dx;
            abs_dy = dy < 0 ? dy * -1 : dy;
            if ((abs_dx == 0 && abs_dy == 1) 
             || (abs_dx == 1 && abs_dy == 0)) {
              send(SOUND + S_FOOTSTEPS+"|"+dx+","+dy, client);
             }
        }
      }
    }
    client.hasCommand = false;
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
    client.target = loc;
    console.log(client.name + ' target: ' + sys.inspect(client.target));
    queueBroadcast(SOUND + S_GUNSHOT, null);
    send('\n' + C_G + SHOT + client.command[1] + '.', client);
  }
  
  
  // comms
  
  function send(message, client) {
    if (client != undefined) { 
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
  }
  
  function broadcast(message, sender) {
    clients.forEach(function (client) {
      if (client === sender || client.dead) return;
      send(message, client);
    });
  }
  
  function sendQueuedBroadcasts() {
    for (var i in broadcasts) {
      broadcast(broadcasts[i].text, broadcasts[i].sender);
    }
    broadcasts = [];
  }
  
  function sendQueuedClientMessages() {
    // not implemented yet.
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
