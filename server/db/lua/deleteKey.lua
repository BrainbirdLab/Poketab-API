redis.call('del', 'chat:' .. ARGV[1])
redis.call('del', 'uid:' .. ARGV[2])
redis.call('del', 'chat:' .. ARGV[1] .. ':users')