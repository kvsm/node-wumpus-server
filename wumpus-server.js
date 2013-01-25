var net = require('net');
var clients = [];

net.createServer( function (client) {
  client.addr = client.remoteAddress + ':' + client.remotePort;
  process.stdout.write('Client ' + client.addr + ' connected\n');
  send('Welcome to WUMPUS IN MA HOOSE!\n', client);
  send('Please enter your name: \n', client);

  client.on('data', function (data) {
    if (clients.indexOf(client) == -1) {
      clients.push(client);
      var name = data.toString().replace('\r\n','');
      if (name.substring(0, 2) === '@#') {
        client.name = name.substring(2);
        client.isUsingRichClient = true;
      } else {
        client.name = name;
        client.isUsingRichClient = false;
      }
      process.stdout.write('Client ' + client.addr + ' identified as ' +
          client.name + ', using rich client: ' + client.isUsingRichClient + '\n');
      var message = ";Y" + client.name + ";W joined the game!\n";
      broadcast(message, client);
    } else {
      
    }
  });
  
  client.on('end', function () {
    clients.splice(clients.indexOf(client), 1);
    if (client.name)
    broadcast(client.name + " left the game.\n");
    process.stdout.write('Player ' + client.name + ' (' + client.addr + ') diconnected\n');
  });
  
  function send(message, client) {
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
