-- Insert new inspection type rows for 'alberta_insurance'
-- Section 1: Steering
INSERT INTO "InspectionSection" (insp_type, section_name, display_order, inspection_items) VALUES
('alberta_insurance', 'Steering', 1, '["Steering Box/Rack", "Struts/Shocks", "Front Suspension", "Tie Rod Ends"]');

-- Section 2: Electrical System
INSERT INTO "InspectionSection" (insp_type, section_name, display_order, inspection_items) VALUES
('alberta_insurance', 'Electrical System', 2, '["Head Lamp/Tail Lamps", "Stop Lamps", "Signal Lamps", "Windshield Wipers"]');

-- Section 3: Tires
INSERT INTO "InspectionSection" (insp_type, section_name, display_order, inspection_items) VALUES
('alberta_insurance', 'Tires', 3, '["Front", "Rear"]');

-- Section 4: Brakes
INSERT INTO "InspectionSection" (insp_type, section_name, display_order, inspection_items) VALUES
('alberta_insurance', 'Brakes', 4, '["Front Lining or Drums", "Rear Lining or Drums", "Park", "Brake Hoses", "Brake Lines"]');

-- Section 5: General Conditions
INSERT INTO "InspectionSection" (insp_type, section_name, display_order, inspection_items) VALUES
('alberta_insurance', 'General Conditions', 5, '["Body Condition", "Muffler/Exhaust", "Motor", "Windshield", "Seat Belts"]');

-- Section 6: Additional details handled outside of InspectionSection dynamic grid
-- (e.g., Roadworthy, Altered, Technician Statement, etc.)
