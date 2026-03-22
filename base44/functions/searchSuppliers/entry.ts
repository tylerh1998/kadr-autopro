import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchTerm } = await req.json();
    
    if (!searchTerm || searchTerm.trim() === '') {
      // Return all suppliers if no search term
      const allSuppliers = await base44.entities.Supplier.list();
      const sorted = allSuppliers.sort((a, b) => {
        if (a.pin_to_top && !b.pin_to_top) return -1;
        if (!a.pin_to_top && b.pin_to_top) return 1;
        return (a.name || '').localeCompare(b.name || '');
      });
      
      return Response.json({ 
        success: true, 
        suppliers: sorted 
      });
    }

    // Get all suppliers
    const allSuppliers = await base44.entities.Supplier.list();
    
    const searchLower = searchTerm.toLowerCase().trim();
    
    // Score and filter suppliers
    const scoredSuppliers = allSuppliers
      .map(supplier => {
        const name = (supplier.name || '').toLowerCase();
        let hitValue = 0;
        
        // Exact match
        if (name === searchLower) {
          hitValue = 100;
        }
        // Starts with search term
        else if (name.startsWith(searchLower)) {
          hitValue = 80;
        }
        // Contains search term
        else if (name.includes(searchLower)) {
          hitValue = 50;
        }
        
        return { ...supplier, hitValue };
      })
      .filter(supplier => supplier.hitValue > 0)
      .sort((a, b) => {
        // Sort by hit value first (highest first)
        if (b.hitValue !== a.hitValue) {
          return b.hitValue - a.hitValue;
        }
        // Then by pin_to_top
        if (a.pin_to_top && !b.pin_to_top) return -1;
        if (!a.pin_to_top && b.pin_to_top) return 1;
        // Then alphabetically
        return (a.name || '').localeCompare(b.name || '');
      });

    return Response.json({ 
      success: true, 
      suppliers: scoredSuppliers 
    });

  } catch (error) {
    console.error('Error searching suppliers:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});