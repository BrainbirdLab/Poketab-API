-- key, uid, socketId
redis.call('srem', 'chat:' .. ARGV[1] .. ':users', ARGV[2])
redis.call('del', 'chat:' .. ARGV[1] .. ':user:' .. ARGV[2])
redis.call('del', 'socket:' .. ARGV[3])
redis.call('hincrby', 'chat:' .. ARGV[1], 'activeUsers', -1)
return 1