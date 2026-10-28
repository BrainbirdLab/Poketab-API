for _, id in ipairs(redis.call('smembers', 'chat:' .. ARGV[1] .. ':users')) do
  redis.call('del', 'uid:' .. id)
end
redis.call('del', 'chat:' .. ARGV[1])
redis.call('del', 'uid:' .. ARGV[2])
redis.call('del', 'chat:' .. ARGV[1] .. ':users')
redis.call('del', 'seen:' .. ARGV[1])
