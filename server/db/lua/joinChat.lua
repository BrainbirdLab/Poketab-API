local data = cjson.decode(ARGV[2])

local create = ARGV[1] == "true" -- true or false
if create == true then
    redis.call('hset', 'chat:' .. data.key.keyId, 'admin', data.key.admin or '', 'activeUsers', 0, 'maxUsers', data.key.maxUsers or 2, 'created', data.key.createdAt)
end

-- add user to chat:KEY:users
redis.call('sadd', 'chat:' .. data.key.keyId .. ':users', data.user.uid)

-- add user data to uid:uid
redis.call('hset', 'uid:' .. data.uid, 'avatar', data.user.avatar, 'joined', data.user.joinedAt, 'uid', data.user.uid, 'publicKey', data.user.publicKey)

-- increment chat:KEY:activeUsers
redis.call('hincrby', 'chat:' .. data.key.keyId, 'activeUsers', 1)

return 1