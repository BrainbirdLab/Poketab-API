local data = cjson.decode(ARGV[2])

local create = ARGV[1] == "true" -- true or false
if create == true then
    redis.call('hset', 'chat:' .. data.key.keyId, 'admin', data.key.admin or '')
    redis.call('hset', 'chat:' .. data.key.keyId, 'activeUsers', 0)
    redis.call('hset', 'chat:' .. data.key.keyId, 'maxUsers', data.key.maxUsers or 2)
    redis.call('hset', 'chat:' .. data.key.keyId, 'created', data.key.createdAt)
end

-- add user to chat:KEY:users
redis.call('sadd', 'chat:' .. data.key.keyId .. ':users', data.user.uid)

-- add user data to chat:KEY:user:UID.keyId
redis.call('hset', 'chat:' .. data.key.keyId .. ':user:' .. data.user.uid, 'name', data.user.name)
redis.call('hset', 'chat:' .. data.key.keyId .. ':user:' .. data.user.uid, 'avatar', data.user.avatar)
redis.call('hset', 'chat:' .. data.key.keyId .. ':user:' .. data.user.uid, 'uid', data.user.uid)
redis.call('hset', 'chat:' .. data.key.keyId .. ':user:' .. data.user.uid, 'joined', data.user.joinedAt)

-- add socket data to socket:ID
redis.call('hset', 'socket:' .. data.socket, 'name', data.user.name)
redis.call('hset', 'socket:' .. data.socket, 'uid', data.user.uid)
redis.call('hset', 'socket:' .. data.socket, 'key', data.key.keyId)

-- increment chat:KEY:activeUsers
redis.call('hincrby', 'chat:' .. data.key.keyId, 'activeUsers', 1)

return 1
