-- key, uid. Idempotent: returns {removed, activeUsers left}; only the call that removes the member decrements
local removed = redis.call('srem', 'chat:' .. ARGV[1] .. ':users', ARGV[2])
redis.call('del', 'uid:' .. ARGV[2])
if removed == 1 then
  return { 1, redis.call('hincrby', 'chat:' .. ARGV[1], 'activeUsers', -1) }
end
return { 0, -1 }
