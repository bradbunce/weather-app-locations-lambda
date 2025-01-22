const queries = {
    getUserLocations: `
        SELECT 
            l.location_id,
            l.name as city_name,
            l.country_code,
            l.latitude,
            l.longitude,
            ufl.display_order,
            ufl.created_at
        FROM locations l
        JOIN user_favorite_locations ufl ON l.location_id = ufl.location_id
        WHERE ufl.user_id = ?
        ORDER BY ufl.display_order ASC, ufl.created_at ASC
    `,

    addLocation: `
        INSERT INTO locations 
        (name, country_code, latitude, longitude)
        VALUES (?, ?, ?, ?)
    `,

    addFavorite: `
        INSERT INTO user_favorite_locations
        (user_id, location_id, display_order)
        VALUES (?, ?, ?)
    `,

    removeLocation: `
        DELETE FROM user_favorite_locations
        WHERE user_id = ? AND location_id = ?
    `,

    updateLocationOrder: `
        UPDATE user_favorite_locations
        SET display_order = ?
        WHERE user_id = ? AND location_id = ?
    `,

    getLocationById: `
        SELECT 
            l.location_id,
            l.name as city_name,
            l.country_code,
            l.latitude,
            l.longitude,
            ufl.display_order,
            ufl.created_at
        FROM locations l
        JOIN user_favorite_locations ufl ON l.location_id = ufl.location_id
        WHERE l.location_id = ? AND ufl.user_id = ?
    `
};

module.exports = { queries };