local keys = redis.call('scan', 0, 'match', 'chat:' .. ARGV[1] .. '*')
if #keys[2] ~= 0 then
    for _, key in ipairs(keys[2]) do
        redis.call('del', key)
    end
end
redis.call('del', 'socket:' .. ARGV[2])