// Hardcoded store inventory
export const storeInventory = [
  { vendor: 'Amazon', name: 'Coca Cola Can', price: 2.50, currency: 'PYUSD' },
  { vendor: 'Amazon', name: 'Coke Can', price: 2.50, currency: 'PYUSD' }, // Alias for Coca Cola
  { vendor: 'Amazon', name: 'Pepsi Can', price: 2.50, currency: 'PYUSD' },
  { vendor: 'Amazon', name: 'Sprite Can', price: 2.50, currency: 'PYUSD' },
  { vendor: 'BestBuy', name: 'USB-C Charger', price: 29.99, currency: 'PYUSD' },
  { vendor: 'BestBuy', name: 'iPhone Charger', price: 24.99, currency: 'PYUSD' },
  { vendor: 'BestBuy', name: 'Laptop Charger', price: 89.99, currency: 'PYUSD' },
  { vendor: 'Walmart', name: 'Water Bottle', price: 1.99, currency: 'PYUSD' },
  { vendor: 'Walmart', name: 'Energy Drink', price: 3.99, currency: 'PYUSD' },
  { vendor: 'FlowStore', name: 'Flow NFT Pack', price: 10.0, currency: 'FLOW' },
  { vendor: 'FlowStore', name: 'Flow Collectible', price: 5.0, currency: 'FLOW' },
];

// Authorized recipients with wallet addresses
export const authorizedRecipients = [
  { 
    name: 'Amazon', 
    pyusdAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb4',
    flowAddress: '0x1234567890abcdef'
  },
  { 
    name: 'BestBuy', 
    pyusdAddress: '0x5aAeb6053f3E94C9b9A09f33669435E7Ef1BeAed',
    flowAddress: '0xfedcba0987654321'
  },
  { 
    name: 'Walmart', 
    pyusdAddress: '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
    flowAddress: '0xabcdef1234567890'
  },
  { 
    name: 'FlowStore', 
    pyusdAddress: '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
    flowAddress: '0x9876543210fedcba'
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