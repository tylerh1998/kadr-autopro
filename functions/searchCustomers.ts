import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchTerm, page = 1, limit = 50 } = await req.json();
    const skip = (page - 1) * limit;

    // Optimization: If no search term, use efficient DB pagination
    if (!searchTerm || searchTerm.trim() === '') {
      // We need total count for pagination. 
      // Current SDK might not give total count easily without fetching all ID's or similar.
      // For now, we'll fetch all to get total count, but slice for return.
      // Ideally we'd have a count() method.
      const allCustomers = await base44.entities.Customer.list();
      const total = allCustomers.length;
      const totalPages = Math.ceil(total / limit);
      
      const sorted = allCustomers.sort((a, b) => {
        const nameA = a.org_name || `${a.last_name || ''} ${a.first_name || ''}`;
        const nameB = b.org_name || `${b.last_name || ''} ${b.first_name || ''}`;
        return nameA.localeCompare(nameB);
      });

      const paginatedCustomers = sorted.slice(skip, skip + limit);
      
      return Response.json({ 
        success: true, 
        customers: paginatedCustomers,
        pagination: {
          total,
          page,
          limit,
          totalPages
        }
      });
    }

    // Search Logic (Ranking)
    const allCustomers = await base44.entities.Customer.list();
    const searchLower = searchTerm.toLowerCase().trim();
    
    const scoredCustomers = allCustomers
      .map(customer => {
        const orgName = (customer.org_name || '').toLowerCase();
        const firstName = (customer.first_name || '').toLowerCase();
        const lastName = (customer.last_name || '').toLowerCase();
        const fullName = `${firstName} ${lastName}`.trim();
        const email = (customer.email || '').toLowerCase();
        const phone = (customer.phone || '').replace(/\D/g, '');
        const secondaryPhone = (customer.secondary_phone || '').replace(/\D/g, '');
        const searchDigits = searchLower.replace(/\D/g, '');
        
        let hitValue = 0;
        
        // Organization name matches
        if (orgName) {
          if (orgName === searchLower) hitValue = 100;
          else if (orgName.startsWith(searchLower)) hitValue = 90;
          else if (orgName.includes(searchLower)) hitValue = 70;
        }
        
        // Name matches
        if (hitValue === 0) {
          if (fullName === searchLower) hitValue = 95;
          else if (lastName === searchLower || firstName === searchLower) hitValue = 85;
          else if (lastName.startsWith(searchLower) || firstName.startsWith(searchLower)) hitValue = 75;
          else if (fullName.includes(searchLower)) hitValue = 60;
        }
        
        // Email matches
        if (hitValue === 0 && email) {
          if (email === searchLower) hitValue = 65;
          else if (email.startsWith(searchLower)) hitValue = 55;
          else if (email.includes(searchLower)) hitValue = 45;
        }
        
        // Phone matches
        if (hitValue === 0 && searchDigits) {
          if (phone === searchDigits || secondaryPhone === searchDigits) hitValue = 60;
          else if (phone.includes(searchDigits) || secondaryPhone.includes(searchDigits)) hitValue = 40;
        }
        
        return { ...customer, hitValue };
      })
      .filter(customer => customer.hitValue > 0)
      .sort((a, b) => {
        if (b.hitValue !== a.hitValue) return b.hitValue - a.hitValue;
        const nameA = a.org_name || `${a.last_name || ''} ${a.first_name || ''}`;
        const nameB = b.org_name || `${b.last_name || ''} ${b.first_name || ''}`;
        return nameA.localeCompare(nameB);
      });

    const total = scoredCustomers.length;
    const totalPages = Math.ceil(total / limit);
    const paginatedCustomers = scoredCustomers.slice(skip, skip + limit);

    return Response.json({ 
      success: true, 
      customers: paginatedCustomers,
       pagination: {
        total,
        page,
        limit,
        totalPages
      }
    });

  } catch (error) {
    console.error('Error searching customers:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});