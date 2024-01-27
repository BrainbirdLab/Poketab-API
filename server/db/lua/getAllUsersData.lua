-- getAllUsers.lua

local userIds = redis.call('hkeys', 'chat:' .. ARGV[1] .. ':users')
local users = {}

-- if no users, return empty table
if #userIds == 0 then
  return cjson.encode(users)
end

for _, id in ipairs(userIds) do
  local userData = redis.call('hmget', 'chat:' .. ARGV[1] .. ':users:' .. id, 'name', 'avatar', 'uid')
  local name, avatar, uid = unpack(userData)
  users[uid] = { name = name, avatar = avatar, uid = uid }
end

return cjson.encode(users)