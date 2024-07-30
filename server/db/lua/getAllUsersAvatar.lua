local userIds = redis.call('smembers', 'chat:' .. ARGV[1] .. ':users')
local users = {}
if #userIds == 0 then
  return cjson.encode(users)
end
for _, id in ipairs(userIds) do
  local userData = redis.call('hmget', 'uid:' .. id, 'avatar')
  -- if no user data then continue
  if userData[1] then
    local avatar = unpack(userData)
    users[id] = { avatar = avatar}
  end
end
return cjson.encode(users)