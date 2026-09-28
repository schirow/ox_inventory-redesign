if not lib then return end

-- Backpacks: using a backpack item opens its own stash (settings in data/backpacks.lua).

local Items = require 'modules.items.client'
local Backpacks = lib.load('data.backpacks').backpacks

local ANIM_DICT = 'amb@world_human_bum_wash@male@low@idle_a'
local ANIM_CLIP = 'idle_a'

RegisterNetEvent('ox_inventory:backpackAnim', function(serverId, playing)
	local player = GetPlayerFromServerId(serverId)
	if player == -1 then return end

	local ped = GetPlayerPed(player)
	if not DoesEntityExist(ped) then return end

	if playing then
		lib.requestAnimDict(ANIM_DICT)
		TaskPlayAnim(ped, ANIM_DICT, ANIM_CLIP, 8.0, -8.0, -1, 1, 0, false, false, false)
	else
		StopAnimTask(ped, ANIM_DICT, ANIM_CLIP, 4.0)
	end
end)

local function openBackpack(_, slot)
	if not Backpacks[slot.name] then return end

	local stashId = lib.callback.await('ox_inventory:openBackpack', 100, slot.slot)
	if not stashId then return end

	-- openInventory only closes an already open inventory instead of switching to another one,
	-- so close it first (same as ox does for items with `client.export` and `close = true`).
	client.closeInventory()

	-- wait until the invOpen state bag reports "closed" (max. 1s)
	local timeout = GetGameTimer() + 1000
	while LocalPlayer.state.invOpen and GetGameTimer() < timeout do Wait(0) end

	client.openInventory('stash', stashId)
end

-- Using a backpack item opens its stash (same as the item "effect" of bandage, armour, ...).
for name in pairs(Backpacks) do
	local item = Items(name)

	if item then
		item.effect = openBackpack
	end
end

-- exports.ox_inventory:openBackpack(data, slot) for other scripts
exports('openBackpack', openBackpack)
