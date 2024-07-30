local exists = redis.call('exists', 'uid:' .. ARGV[2])
local activeUsers = redis.call('hget', 'chat:' .. ARGV[1], 'activeUsers')
return { exists, activeUsers }