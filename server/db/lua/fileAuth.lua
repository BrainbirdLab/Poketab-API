-- key, uid, resumeToken: uid is public, so the owner's resumeToken proves identity
local member = redis.call('sismember', 'chat:' .. ARGV[1] .. ':users', ARGV[2]) == 1
  and redis.call('hget', 'uid:' .. ARGV[2], 'resumeToken') == ARGV[3]
local activeUsers = redis.call('hget', 'chat:' .. ARGV[1], 'activeUsers')
return { member and 1 or 0, activeUsers }
