const mysql = require('mysql2/promise');
const { queries } = require('./queries');

const dbConfig = {
    primary: {
        host: process.env.DB_PRIMARY_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    },
    replica: {
        host: process.env.DB_READ_REPLICA_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    }
};

const createConnection = async (operation = 'read') => {
    const config = operation === 'read' ? dbConfig.replica : dbConfig.primary;
    return await mysql.createConnection(config);
};

const getUserLocationsFromDb = async (userId) => {
    const connection = await createConnection('read');
    try {
        const [rows] = await connection.execute(queries.getUserLocations, [userId]);
        return rows;
    } finally {
        await connection.end();
    }
};

const getMaxDisplayOrderForUserFromDb = async (userId) => {
    const connection = await createConnection('read');
    try {
        const [rows] = await connection.execute(queries.getMaxDisplayOrder, [userId]);
        return rows[0].max_order;
    } finally {
        await connection.end();
    }
};

const addLocationToDb = async (userId, locationData) => {
    const connection = await createConnection('write');
    try {
        await connection.beginTransaction();

        // Check if location exists first
        const [existingLocations] = await connection.execute(
            'SELECT location_id FROM locations WHERE name = ? AND country_code = ?',
            [locationData.city_name, locationData.country_code]
        );

        let locationId;
        if (existingLocations.length > 0) {
            locationId = existingLocations[0].location_id;
            console.log('Using existing location:', { locationId });
        } else {
            // Insert new location
            const [result] = await connection.execute(
                'INSERT INTO locations (name, country_code, latitude, longitude) VALUES (?, ?, ?, ?)',
                [
                    locationData.city_name,
                    locationData.country_code,
                    locationData.latitude,
                    locationData.longitude
                ]
            );
            locationId = result.insertId;
            console.log('Created new location:', { locationId });
        }

        // Get max display order in the same connection
        const [orderRows] = await connection.execute(
            'SELECT COALESCE(MAX(display_order), -1) as max_order FROM user_favorite_locations WHERE user_id = ?',
            [userId]
        );
        const nextOrder = orderRows[0].max_order + 1;

        // Add to user_favorite_locations
        await connection.execute(
            'INSERT INTO user_favorite_locations (user_id, location_id, display_order) VALUES (?, ?, ?)',
            [userId, locationId, nextOrder]
        );

        await connection.commit();
        console.log('Successfully added location:', { 
            userId, 
            locationId, 
            displayOrder: nextOrder 
        });
        return locationId;
    } catch (error) {
        console.error('Error adding location:', {
            error: error.message,
            userId,
            locationData
        });
        await connection.rollback();
        throw error;
    } finally {
        await connection.end();
    }
};

const removeLocationFromDb = async (userId, locationId) => {
    const connection = await createConnection('write');
    try {
        await connection.beginTransaction();

        // Remove from user_favorite_locations
        await connection.execute(queries.removeLocation, [userId, locationId]);

        // Fetch remaining locations to re-order
        const [remainingLocations] = await connection.execute(
            'SELECT location_id FROM user_favorite_locations WHERE user_id = ? ORDER BY display_order ASC',
            [userId]
        );

        // Re-assign display orders
        for (let i = 0; i < remainingLocations.length; i++) {
            await connection.execute(
                queries.updateLocationOrder,
                [i, userId, remainingLocations[i].location_id]
            );
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        await connection.end();
    }
};

const updateLocationOrderInDb = async (userId, locationOrder) => {
    const connection = await createConnection('write');
    try {
        await connection.beginTransaction();
        
        for (let i = 0; i < locationOrder.length; i++) {
            await connection.execute(
                queries.updateLocationOrder,
                [i, userId, locationOrder[i]]
            );
        }
        
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        await connection.end();
    }
};

module.exports = {
    createConnection,
    getUserLocationsFromDb,
    addLocationToDb,
    removeLocationFromDb,
    updateLocationOrderInDb,
    getMaxDisplayOrderForUserFromDb
};