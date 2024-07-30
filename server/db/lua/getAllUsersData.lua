local userIds = redis.call('smembers', 'chat:' .. ARGV[1] .. ':users')
local users = {}
if #userIds == 0 then
  return cjson.encode(users)
end
for _, id in ipairs(userIds) do
  local userData = redis.call('hmget', 'uid:' .. id, 'avatar', 'publicKey', 'uid')
  -- if no user data then continue
  if userData[1] then
    -- add user data to users table like uid: { avatar, publicKey, uid }
    local avatar, publicKey, uid = unpack(userData)
    users[id] = { avatar = avatar, publicKey = publicKey, uid = uid }
  end
end
return cjson.encode(users)