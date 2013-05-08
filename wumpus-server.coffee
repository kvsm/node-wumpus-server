net = require 'net'
sys = require 'sys'
Strings = require './assets/strings'
wumpus = require './models/wumpus'

S_HEARTBEAT_LOUD  = 0;
S_HEARTBEAT_MED   = 1;
S_HEARTBEAT_QUIET = 2;
S_START           = 3;
S_DEATH           = 4;
S_GUNSHOT         = 5;
S_WUMPUS_DEATH    = 6;
S_FOOTSTEPS       = 8;
S_CANNOT_MOVE     = 9;

DIRS = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
ROOM_MAX_X = 3;
ROOM_MAX_Y = 3;
PLAYER_MOVED_WUMPUS = 0;
PLAYER_DEATH        = 1;
WUMPUS_MOVED_PLAYER = 2;

clients = []
broadcasts = []
wumpus = {}

server = net.createServer (client) ->
  client.addr = "#{ client.remoteAddress }:#{ client.remotePort }"
  console.log "Client #{ client.addr } connected"
  if clients.length is 0 then initGame()
  send Strings.WELCOME, client
  client.ready = false
  
  client.on 'data', (data) ->
    console.log "Client: #{ client.addr } Data: #{ data.toString().replace '\n', '' }"
    if client not in clients
      unless client.ready
        dynamicAdjust()
        init client, data, clients.length
        send Strings.CLS, client
        if client.isUsingRichClient
          send Strings.INTRO, client
        else
          send Strings.INTROTELNET, client 
        client.ready = true
      else
        queueBroadcast Strings.C_Y + client.name + Strings.C_W + Strings.JOINED + " (#{ clients.length + 1 } players connected)", client
        joinGame client
    else
      unless client.dead
        command = data.toString().replace '\r\n', ''
        parse command, client
        clearTimeout client.timeout
        if client.hasCommand
          process client
        else
          send Strings.ROOM_READY_MOVE + Strings.PROMPT + Strings.C_Y + client.name, client
          client.timeout = setTimeout setAFK, 10000, client if clients.length > 1 and not client.dead
      else
        joinGame client
  
  client.on 'end', ->
    console.log "Player #{ client.name } (#{ client.addr }) disconnected"
    clearTimeout client.timeout
    if client in clients
      clients.splice clients.indexOf(client), 1
      for c in clients
        send Strings.C_Y + client.name + Strings.C_W + Strings.LEFT, c
      if checkClientCommands()
        for c in clients
          unless c.dead
            processCommands c
      dynamicAdjust()
    
  client.on 'error', ->
    client.end()
    client.destroy()

server.listen 5000

init = (client, data, num) ->
  name = data.toString().replace '\r\n', ''
  if name.startsWith Strings.RICH_TAG
    client.name = name.substring 2
    client.isUsingRichClient = true
  else
    client.name = name;  
    client.isUsingRichClient = false
  if client.name is "\n"
    client.name = "Player #{ num + 1 }"
  client.score = 0
  console.log "Client: #{ client.addr } identified as #{ client.name }, using rich client: #{ client.isUsingRichClient }"

initGame = ->
  broadcasts = []
  ROOM_MAX_X = ROOM_MAX_Y = 8 + Math.floor((clients.length + 1) * 0.2)
  console.log "Initialising game..."
  console.log "Placing Wumpus..."
  wumpus.location = getRandomLocation false
  console.log "Wumpus placed at #{ sys.inspect wumpus.location }"
  resetTargets()
  
joinGame = (client) ->
  client.hasCommand = false
  client.dead = false
  client.target = {}
  client.queue = []
  if client.afk
    client.afk = false
  else
    client.location = getRandomLocation true
    console.log "#{ client.name } added at #{ sys.inspect client.location }"
  clients[0].timeout = setTimeout setAFK, 10000, clients[0] if clients.length is 1 and not clients[0].dead
  clients.push client unless client in clients
  resolveTurn client
  send Strings.SOUND + S_START, client
  send Strings.PROMPT + Strings.C_Y + client.name, client
  client.timeout = setTimeout setAFK, 10000, client if clients.length > 1 and not client.dead
  
resetGame = ->
  initGame()
  console.log 'Scores:'
  for c in clients
    console.log c.name + ': ' + c.score
    sendScores c
    send Strings.STARTING_NEXT_ROUND, c
    joinGame c
  return
  
process = (client) ->
  unless checkClientCommands()
    send Strings.WAITING_FOR_PLAYERS, client unless client.dead
  else
    processCommands c for c in clients when not c.dead
    shooter = checkShot wumpus
    if shooter
      shooter.score += 7
      # send Strings.SOUND + S_GUNSHOT, c for c in clients when c isnt shooter
      broadcast Strings.SOUND + S_WUMPUS_DEATH
      send Strings.SB + "You#{ Strings.SHOT_THE_WUMPUS + Strings.C_B } Way to go!", shooter
      broadcast Strings.SB + Strings.C_Y + shooter.name + Strings.C_W + Strings.SHOT_THE_WUMPUS, shooter
      resetGame()
    else
      moveWumpus()
      for c in clients
        unless c.dead
          resolveTurn c
          c.timeout = setTimeout setAFK, 10000, c if clients.length > 1 and not c.dead
      sendQueuedBroadcasts()
      sendQueuedClientMessages()
      resetTargets()
      for c in clients
        if c? and not c.dead
          send Strings.ROOM_READY_MOVE + Strings.PROMPT + Strings.C_Y + c.name, c
  
setAFK = (client) ->
  send Strings.AFK, client
  client.dead = true
  client.afk = true
  process client
  
checkClientCommands = ->
  for client in clients
    return false unless client.hasCommand or client.dead
  true
  
parse = (command, client) ->
  cmdArray = command.split " "
  switch cmdArray[0].toUpperCase()
    when 'MOVE'
      unless client.hasCommand
        unless cmdArray[1]?
          send Strings.ENTER_MOVE_DIR, client
        else unless cmdArray[1].toUpperCase() in DIRS
          send Strings.ENTER_VALID_DIR, client
        else
          if checkBoundaries cmdArray[1].toUpperCase(), client
            client.command = cmdArray
            client.hasCommand = true
          else
            send Strings.SOUND + S_CANNOT_MOVE, client
            send Strings.INVALID_MOVE, client
    when 'SHOOT'
      unless client.hasCommand
        unless cmdArray[1]?
          send Strings.ENTER_SHOOT_DIR, client
        else unless cmdArray[1].toUpperCase() in DIRS
          send Strings.ENTER_VALID_DIR, client
        else
          if checkBoundaries cmdArray[1].toUpperCase(), client
            client.command = cmdArray
            client.hasCommand = true
          else
            send Strings.INVALID_SHOT, client
    when 'PLAYERS'
      plist = ""
      for c in clients
        plist += "|" + Strings.C_Y + c.name+"|" + Strings.C_P + c.addr + "\n"
      send Strings.PLAYERLIST + plist, client
    else send Strings.COMMAND_NOT_FOUND, client
  return
  
processCommands = (client) ->
  switch client.command[0].toUpperCase()
    when 'MOVE' then movePlayer client
    when 'SHOOT' then shoot client
  return
      
movePlayer = (client) ->
  switch client.command[1].toUpperCase()
    when 'NORTH' then client.location.y++
    when 'SOUTH' then client.location.y--
    when 'EAST' then client.location.x++
    when 'WEST' then client.location.x--
  console.log "#{ client.name } new position: #{ sys.inspect client.location }"
  send '\n' + Strings.C_G + Strings.MOVED + client.command[1] + '.', client
  return
  
moveWumpus = ->
  if Math.random() > 0.65
    loc = {}
    moved = false
    until moved
      loc.x = wumpus.location.x
      loc.y = wumpus.location.y
      dir = Math.floor(Math.random() * 4)
      switch dir
        when 0 then loc.y++
        when 1 then loc.y--
        when 2 then loc.x++
        when 3 then loc.x--
      if loc.x < ROOM_MAX_X and loc.x >= 0 and loc.y < ROOM_MAX_Y and loc.y >= 0
        moved = true
        wumpus.location = loc
    console.log "Wumpus has moved to #{ sys.inspect wumpus.location }"
    for c in clients
      if c.location.x is wumpus.location.x and c.location.y is wumpus.location.y
        killPlayer c, WUMPUS_MOVED_PLAYER
  return
  
shoot = (client) ->
  loc = {}
  loc.x = client.location.x
  loc.y = client.location.y
  switch client.command[1].toUpperCase()
    when 'NORTH' then loc.y++
    when 'SOUTH' then loc.y--
    when 'EAST' then loc.x++
    when 'WEST' then loc.x--
  client.target = loc
  console.log "#{ client.name } target: #{ sys.inspect client.target }"

  for c in clients
    unless c.dead
      if client.location.x is c.location.x and client.location.y is c.location.y
        send Strings.SOUND + S_GUNSHOT, c
      else 
        # send gunshot with panning and volume
        dx = client.location.x - c.location.x
        dy = client.location.y - c.location.y
        send Strings.SOUND + S_GUNSHOT+"|"+dx+","+dy, c
        unless client.isUsingRichClient
          if dx < 0
            send Strings.C_G + Strings.HEARDSHOT + "WEST", client
          else if dx > 0
            send Strings.C_G + Strings.HEARDSHOT + "EAST", client
          else if dy < 0
            send Strings.C_G + Strings.HEARDSHOT + "SOUTH", client
          else if dy > 0
            send Strings.C_G + Strings.HEARDSHOT + "NORTH", client
  send '\n' + Strings.C_G + Strings.SHOT + client.command[1] + '.', client
  return
  
resolveTurn = (client) ->
  console.log "Resolve turn: #{ client.name }"
  send Strings.ROOM_RESET, client
  send Strings.ROOM_DESC, client
  shooter = checkShot client
  if shooter
    killPlayer client, PLAYER_DEATH, shooter
  else if eatenByWumpus client
    killPlayer client, PLAYER_MOVED_WUMPUS
  unless client.dead
    for c in clients
      if c isnt client and not c.dead
        if client.location.x is c.location.x and client.location.y is c.location.y
          send Strings.C_Y + c.name + Strings.C_W + Strings.STANDING_HERE, client
        else
          # check if we should play footsteps (neighbouring)
          dx = c.location.x - client.location.x 
          dy = c.location.y - client.location.y
          abs_dx = if dx < 0 then dx * -1 else dx
          abs_dy = if dy < 0 then dy * -1 else dy
          if (abs_dx is 0 and abs_dy is 1) or (abs_dx is 1 and abs_dy is 0)
            send Strings.SOUND + S_FOOTSTEPS+"|"+dx+","+dy, client
  client.hasCommand = false
  return

killPlayer = (client, cause, killer) ->
  clearTimeout client.timeout
  unless client.dead
    client.dead = true
    client.location = {}
    send Strings.SOUND + S_DEATH, client
    client.score--
    switch(cause)
      when PLAYER_MOVED_WUMPUS
        send Strings.CLS, client
        send Strings.WUMPUS_HERE, client
        send Strings.KILLED_BY_WUMPUS, client
        broadcast Strings.C_Y + client.name + Strings.C_W + Strings.PLAYER_KILLED_BY_WUMPUS, client
      when PLAYER_DEATH
        killer.score += 2
        send Strings.CLS, client
        send Strings.KILLED_BY_PLAYER + Strings.C_Y + killer.name + Strings.C_W + '!', client
        broadcast Strings.C_Y + client.name + Strings.C_W + Strings.KILLED_BY + Strings.C_Y + killer.name + Strings.C_W + '!', client
        send Strings.SOUND + S_GUNSHOT, client
      when WUMPUS_MOVED_PLAYER
        send Strings.CLS, client
        send Strings.WUMPUS_SNEAK, client
        send Strings.KILLED_BY_WUMPUS, client
        broadcast Strings.C_Y + client.name + Strings.C_W + Strings.PLAYER_KILLED_BY_WUMPUS, client
    send Strings.RESPAWN, client
  return
  
eatenByWumpus = (client) ->
  dx = wumpus.location.x - client.location.x
  dy = wumpus.location.y - client.location.y
  abs_dx = if dx < 0 then dx * -1 else dx
  abs_dy = if dy < 0 then dy * -1 else dy
  sqdist = abs_dx*abs_dx + abs_dy*abs_dy
  if sqdist is 0
    true
  else if sqdist <= 1
    send Strings.SOUND + S_HEARTBEAT_LOUD + "|" + dx + "," + dy, client
    send Strings.WUMPUS_NEAR, client
    false
  else if sqdist <= 4
    send Strings.SOUND + S_HEARTBEAT_MED + "|"+dx+","+dy, client
    send Strings.WUMPUS_MID, client
    false
  else if sqdist <= 9
    send Strings.SOUND + S_HEARTBEAT_QUIET + "|"+dx+","+dy, client
    send Strings.WUMPUS_FAR, client
    false

checkBoundaries = (direction, client) ->
  switch direction
    when 'NORTH' then return false if client.location.y + 1 >= ROOM_MAX_Y
    when 'SOUTH' then return false if client.location.y - 1 < 0
    when 'EAST' then return false if client.location.x + 1 >= ROOM_MAX_X
    when 'WEST' then return false if client.location.x - 1 < 0
  true

checkShot = (victim) ->
  for c in clients
    return c if c.target.x is victim.location.x and c.target.y is victim.location.y
  false
  
dynamicAdjust = ->
  ROOM_MAX_X = ROOM_MAX_Y = 8 + Math.floor((clients.length + 1) * 0.2)
  for c in clients
    ROOM_MAX_X = c.location.x if c.location.x > ROOM_MAX_X   
    ROOM_MAX_Y = c.location.y if c.location.y > ROOM_MAX_Y
  ROOM_MAX_X = wumpus.location.x if wumpus.location.x > ROOM_MAX_X
  ROOM_MAX_Y = wumpus.location.y if wumpus.location.y > ROOM_MAX_Y   
  console.log "dynamicmap: #{ clients.length } #{ ROOM_MAX_X },#{ ROOM_MAX_Y }"
  return

  
getRandomLocation = (shouldBeEmpty) ->
  location = {}
  location.x = Math.floor(Math.random() * ROOM_MAX_X)
  location.y = Math.floor(Math.random() * ROOM_MAX_Y)
  if shouldBeEmpty and not roomIsEmpty location
    getRandomLocation shouldBeEmpty
  else
    location
    
roomIsEmpty = (loc) ->
  for c in clients
    return false if c.location.x is loc.x and c.location.y is loc.y
  return false if wumpus.location.x is loc.x and wumpus.location.y is loc.y
  true
      
resetTargets = ->
  console.log "Resetting targets..."
  c.target = {} for c in clients
  return
  
sendScores = (client) ->
  send Strings.SB, client
  send Strings.SB + Strings.SCORES_TITLE, client
  send Strings.SB, client
  clientCopy = clients[..]
  clientCopy = clientCopy.sort (a,b) ->  return b.score - a.score
  for c, i in clientCopy
    if client.isUsingRichClient
      send Strings.SB + Strings.C_R + c.score + Strings.C_B + ' - ' + Strings.C_Y + c.name, client
    else
      send Strings.SB + Strings.SCORES_PADDING + Strings.C_R + c.score + Strings.C_B + ' - ' + Strings.C_Y + c.name, client
    break if i > 4
  send Strings.SB, client
  if client.isUsingRichClient
    send Strings.SB + Strings.C_R + client.score + Strings.C_B + ' - ' + Strings.C_Y + client.name, client
  else
    send Strings.SB + Strings.SCORES_PADDING + Strings.C_R + client.score + Strings.C_B + ' - ' + Strings.C_Y + client.name, client
  return
  
send = (message, client) ->
  if client?
    unless message.endsWith '\n'
      message = "#{ message }\n"
    message = stripCodes message unless client.isUsingRichClient
    client.write message unless message is null
  return

sendQueuedBroadcasts = ->
  for msg in broadcasts
    broadcast(msg.text, msg.sender)
  broadcasts = []

sendQueuedClientMessages = ->
  # not implemented yet.
    
broadcast = (message, sender) ->
  send message, client for client in clients when client isnt sender and not client.dead
  return
    
queueBroadcast = (message, sender) ->
  post = {}
  post.text = message
  post.sender = sender
  broadcasts.push post
  return
    
stripCodes = (message) ->
  return null if message.startsWith Strings.SOUND
  re = new RegExp ';\\w', 'g'
  message.replace re , ''

String.prototype.startsWith = (prefix) ->
  @substring(0, prefix.length) is prefix

String.prototype.endsWith = (suffix) ->
  @indexOf(suffix, @length - suffix.length) isnt -1

