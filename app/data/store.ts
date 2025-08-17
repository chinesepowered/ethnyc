// Hardcoded store inventory
export const storeInventory = [
  { vendor: 'Amazon', name: 'Coca Cola Can', price: 1.00, currency: 'PYUSD' },
  { vendor: 'Amazon', name: 'Coke Can', price: 1.00, currency: 'PYUSD' }, // Alias for Coca Cola
  { vendor: 'Amazon', name: 'Pepsi Can', price: 1.00, currency: 'PYUSD' },
  { vendor: 'Amazon', name: 'Sprite Can', price: 1.00, currency: 'PYUSD' },
  { vendor: 'BestBuy', name: 'USB-C Charger', price: 5.00, currency: 'FLOW' },
  { vendor: 'BestBuy', name: 'Phone Charger', price: 2.00, currency: 'FLOW' },
  { vendor: 'BestBuy', name: 'Laptop Charger', price: 8.00, currency: 'PYUSD' },
  { vendor: 'Walmart', name: 'Water Bottle', price: 5.00, currency: 'PYUSD' },
  { vendor: 'Walmart', name: 'Energy Drink', price: 2.00, currency: 'PYUSD' },
  { vendor: 'FlowStore', name: 'Flow NFT Pack', price: 5.0, currency: 'FLOW' },
  { vendor: 'FlowStore', name: 'Flow Collectible', price: 5.0, currency: 'FLOW' },
];

// Authorized recipients with wallet addresses
export const authorizedRecipients = [
  { 
    name: 'Amazon', 
    pyusdAddress: '0xe3B24b93C18eD1B7eEa9e07b3B03D03259f3942e',
    flowAddress: '0xecb8d6f1b3a8639f'
  },
  { 
    name: 'BestBuy', 
    pyusdAddress: '0xe3B24b93C18eD1B7eEa9e07b3B03D03259f3942e',
    flowAddress: '0xecb8d6f1b3a8639f'
  },
  { 
    name: 'Walmart', 
    pyusdAddress: '0xe3B24b93C18eD1B7eEa9e07b3B03D03259f3942e',
    flowAddress: '0xecb8d6f1b3a8639f'
  },
  { 
    name: 'FlowStore', 
    pyusdAddress: '0xe3B24b93C18eD1B7eEa9e07b3B03D03259f3942e',
    flowAddress: '0xecb8d6f1b3a8639f'
  },
];

export function findItemByDescription(description: string): typeof storeInventory[0] | null {
  const lowerDesc = description.toLowerCase().trim();
  
  // First try exact match
  const exactMatch = storeInventory.find(item => 
    item.name.toLowerCase() === lowerDesc
  );
  if (exactMatch) return exactMatch;
  
  // Find best match based on description
  return storeInventory.find(item => {
    const itemName = item.name.toLowerCase();
    
    // Split into words for better matching
    const descWords = lowerDesc.split(/\s+/);
    const itemWords = itemName.split(/\s+/);
    
    // Check if any significant word matches
    const hasMatch = descWords.some(word => 
      itemWords.some(itemWord => 
        itemWord.includes(word) || word.includes(itemWord)
      )
    );
    
    if (hasMatch) return true;
    
    // Check for common variations
    const variations = [
      { search: ['coke', 'cola', 'soda'], match: ['coke', 'cola', 'pepsi', 'sprite'] },
      { search: ['charger', 'cable'], match: ['charger'] },
      { search: ['drink', 'beverage'], match: ['drink', 'cola', 'pepsi', 'sprite', 'water'] },
      { search: ['water'], match: ['water', 'bottle'] },
      { search: ['nft', 'collectible'], match: ['nft', 'collectible', 'flow'] }
    ];
    
    for (const variant of variations) {
      const hasSearchTerm = variant.search.some(term => lowerDesc.includes(term));
      const hasMatchTerm = variant.match.some(term => itemName.includes(term));
      if (hasSearchTerm && hasMatchTerm) return true;
    }
    
    return false;
  }) || null;
}

export function getAllItems(): typeof storeInventory {
  return storeInventory;
}

export function getRecipientByVendor(vendor: string): typeof authorizedRecipients[0] | null {
  return authorizedRecipients.find(r => r.name === vendor) || null;
}