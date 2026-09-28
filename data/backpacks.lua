-- Backpacks: item name -> backpack settings. Add/remove entries here to add more sizes;
-- the item itself must also exist in data/items.lua (with `bag = true`).
return {
    -- Allow only one backpack (any size) in the inventory?
    oneBagInInventory = false,

    backpacks = {
        ['backpack_small'] = {
            label = 'Small Backpack',
            slots = 10,        -- slots inside the backpack
            maxWeight = 15000, -- max weight (grams) storable inside the backpack
        },
        ['backpack_large'] = {
            label = 'Large Backpack',
            slots = 20,
            maxWeight = 30000,
        },
    },

    strings = {
        action_incomplete = 'Action not possible',
        one_backpack_only = 'You can only carry one backpack!',
        backpack_in_backpack = 'You cannot put a backpack inside a backpack!',
    },
}
