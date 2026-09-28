if not lib then return end

-- Backpacks: opening a backpack item opens its own stash. The stash id is generated lazily on first open
-- and stored in the item's metadata (metadata.stashId), so existing backpacks keep their contents.

local Inventory = require 'modules.inventory.server'
local config = lib.load('data.backpacks')
local Backpacks = config.backpacks
local Strings = config.strings

local function notify(playerId, title, text, notifyType)
	TriggerClientEvent('ox_lib:notify', playerId, { title = title, description = text, type = notifyType })
end

local function generateStashId()
	return ('backpack-%s-%s'):format(os.time(), math.random(100000, 999999))
end

lib.callback.register('ox_inventory:openBackpack', function(source, slotId)
	local slot = Inventory.GetSlot(source, slotId)
	if not slot or not slot.name then return end

	local backpack = Backpacks[slot.name]
	if not backpack then return end

	local metadata = slot.metadata or {}

	if not metadata.stashId then
		metadata.stashId = generateStashId()
		Inventory.SetMetadata(source, slotId, metadata)
	end

	Inventory.RegisterStash(metadata.stashId, backpack.label, backpack.slots, backpack.maxWeight, false, false)

	return metadata.stashId
end)

---true if `invId` is the stash of one of `playerId`'s own backpacks
local function isOwnBackpackStash(playerId, invId)
	if not invId then return false end

	local inventory = Inventory(playerId)
	if not inventory then return false end

	for _, item in pairs(inventory.items) do
		if Backpacks[item.name] and item.metadata and item.metadata.stashId == invId then
			return true
		end
	end

	return false
end

-- Play the loop animation only while the player is looking inside one of their backpacks.
AddEventHandler('ox_inventory:openedInventory', function(playerId, invId)
	if isOwnBackpackStash(playerId, invId) then
		TriggerClientEvent('ox_inventory:backpackAnim', -1, playerId, true)
	end
end)

AddEventHandler('ox_inventory:closedInventory', function(playerId, invId)
	if isOwnBackpackStash(playerId, invId) then
		TriggerClientEvent('ox_inventory:backpackAnim', -1, playerId, false)
	end
end)

-- Block putting a backpack into a backpack (backpack stash ids always start with 'backpack-'),
-- both via drag & drop and via direct item creation.
server.registerHook('swapItems', function(payload)
	if payload.toType == 'stash' and tostring(payload.toInventory):match('^backpack%-') then
		notify(payload.source, Strings.action_incomplete, Strings.backpack_in_backpack, 'error')
		return false
	end

	return true
end, { itemFilter = Backpacks })

server.registerHook('createItem', function(payload)
	if payload.inventoryId and tostring(payload.inventoryId):match('^backpack%-') then
		return false
	end

	return true
end, { itemFilter = Backpacks })

if config.oneBagInInventory then
	server.registerHook('createItem', function(payload)
		local inventory = Inventory(payload.inventoryId)
		if not inventory then return end

		local keepSlot, count = nil, 0

		for _, item in pairs(inventory.items) do
			if Backpacks[item.name] then
				count += 1
				keepSlot = keepSlot or item.slot
			end
		end

		if count < 2 then return end

		-- Remove the newly added backpack, keep the one that was already there.
		SetTimeout(1000, function()
			for _, item in pairs(inventory.items) do
				if Backpacks[item.name] and item.slot ~= keepSlot then
					if Inventory.RemoveItem(payload.inventoryId, item.name, 1, nil, item.slot) then
						notify(payload.inventoryId, Strings.action_incomplete, Strings.one_backpack_only, 'error')
					end

					break
				end
			end
		end)
	end, { itemFilter = Backpacks })
end
