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

    // Fetch necessary data
    // Note: Ideally we would filter at DB level, but for comprehensive search across joined fields (customer name),
    // and custom ranking, we'll fetch and process in memory for now.
    const [vehicles, customers] = await Promise.all([
      base44.entities.Vehicle.list(),
      base44.entities.Customer.list()
    ]);

    const customerMap = new Map(customers.map(c => [c.id, c]));

    let resultVehicles = [];

    if (!searchTerm || searchTerm.trim() === '') {
      // Default Sort: Created Date Descending (simulated by ID or explicit field if available)
      // Assuming 'created_date' is available, or we just rely on default order. 
      // Let's sort by year desc, then make, then model for a nice default list.
      resultVehicles = vehicles.sort((a, b) => {
         return (b.year || 0) - (a.year || 0); // Newest vehicles first
      });
    } else {
      const searchLower = searchTerm.toLowerCase().trim();
      
      resultVehicles = vehicles
        .map(vehicle => {
          const customer = customerMap.get(vehicle.customer_id);
          const make = (vehicle.make || '').toLowerCase();
          const model = (vehicle.model || '').toLowerCase();
          const year = (vehicle.year || '').toString();
          const vin = (vehicle.vin || '').toLowerCase();
          const plate = (vehicle.license_plate || '').toLowerCase();
          const unit = (vehicle.unit_number || '').toLowerCase();
          
          const customerOrg = (customer?.org_name || '').toLowerCase();
          const customerFirst = (customer?.first_name || '').toLowerCase();
          const customerLast = (customer?.last_name || '').toLowerCase();
          const customerFull = `${customerFirst} ${customerLast}`.trim();

          let hitValue = 0;

          // VIN/Plate matches (Highest Priority - Specific)
          if (vin === searchLower || plate === searchLower) hitValue = 100;
          else if (vin.includes(searchLower) || plate.includes(searchLower)) hitValue = 90;

          // Unit Number
          if (hitValue === 0 && unit === searchLower) hitValue = 85;
          else if (hitValue === 0 && unit.includes(searchLower)) hitValue = 80;

          // Customer Name Matches
          if (hitValue === 0) {
            if (customerOrg.includes(searchLower) || customerFull.includes(searchLower)) hitValue = 70;
          }

          // Vehicle Info Matches (Broader)
          if (hitValue === 0) {
             const vehicleString = `${year} ${make} ${model}`.toLowerCase();
             if (vehicleString.includes(searchLower)) hitValue = 60;
             else if (make.includes(searchLower) || model.includes(searchLower)) hitValue = 50;
             else if (year.includes(searchLower)) hitValue = 40;
          }

          return { ...vehicle, hitValue };
        })
        .filter(v => v.hitValue > 0)
        .sort((a, b) => b.hitValue - a.hitValue);
    }

    const total = resultVehicles.length;
    const totalPages = Math.ceil(total / limit);
    const paginatedVehicles = resultVehicles.slice(skip, skip + limit);

    return Response.json({ 
      success: true, 
      vehicles: paginatedVehicles,
      customers: customers, // Return customers too so frontend can map names
      pagination: {
        total,
        page,
        limit,
        totalPages
      }
    });

  } catch (error) {
    console.error('Error searching vehicles:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});