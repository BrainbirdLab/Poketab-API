local data = cjson.decode(ARGV[2])

local create = ARGV[1] == "true" -- true or false
if create == true then
    redis.call('hset', 'chat:' .. data.key.keyId, 'admin', data.key.admin or '', 'activeUsers', 0, 'maxUsers', data.key.maxUsers or 2, 'created', data.key.createdAt)
end

-- add user to chat:KEY:users
redis.call('sadd', 'chat:' .. data.key.keyId .. ':users', data.user.uid)

-- add user data to chat:KEY:user:UID.keyId
redis.call('hset', 'chat:' .. data.key.keyId .. ':user:' .. data.user.uid, 'avatar', data.user.avatar, 'uid', data.user.uid, 'joined', data.user.joinedAt)

redis.call('hset', 'socket:' .. data.socket, 'uid', data.user.uid, 'key', data.key.keyId, 'avatar', data.user.avatar)

-- increment chat:KEY:activeUsers
redis.call('hincrby', 'chat:' .. data.key.keyId, 'activeUsers', 1)

return 1