-- key, uid, uidId
redis.call('srem', 'chat:' .. ARGV[1] .. ':users', ARGV[2])
redis.call('del', 'uid:' .. ARGV[2])
redis.call('hincrby', 'chat:' .. ARGV[1], 'activeUsers', -1)
return 1