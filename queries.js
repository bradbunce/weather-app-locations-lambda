const queries = {
    getUserLocations: `
        SELECT 
            location_id,
            city_name,
            country_code,
            latitude,
            longitude,
            display_order,
            created_at
        FROM user_locations 
        WHERE user_id = ?
        ORDER BY display_order ASC, created_at ASC
    `,

    addLocation: `
        INSERT INTO user_locations (
            user_id,
            city_name,
            country_code,
            latitude,
            longitude,
            display_order
        ) VALUES (?, ?, ?, ?, ?, ?)
    `,

    removeLocation: `
        DELETE FROM user_locations 
        WHERE user_id = ? AND location_id = ?
    `,

    updateLocationOrder: `
        UPDATE user_locations 
        SET display_order = ?
        WHERE user_id = ? AND location_id = ?
    `,

    getLocationById: `
        SELECT * FROM user_locations
        WHERE location_id = ? AND user_id = ?
    `
};

module.exports = { queries };