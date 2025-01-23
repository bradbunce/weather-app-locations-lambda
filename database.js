const mysql = require('mysql2/promise');
const { queries } = require('./queries');
const AWS = require('aws-sdk');
const lambda = new AWS.Lambda();

const dbConfig = {
    primary: {
        host: process.env.DB_PRIMARY_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        // Add timeouts
        connectTimeout: 3000, // 3 seconds
        timeout: 3000 // 3 seconds for queries
    },
    replica: {
        host: process.env.DB_READ_REPLICA_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        // Add timeouts
        connectTimeout: 3000,
        timeout: 3000
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

const addLocationToDb = async (userId, locationData) => {
    const connection = await createConnection('write');
    try {
        await connection.beginTransaction();

        // Check if location exists
        const [existingLocations] = await connection.execute(
            'SELECT location_id FROM locations WHERE name = ? AND country_code = ?',
            [locationData.city_name, locationData.country_code]
        );

        let locationId;
        let isNewLocation = false;
        
        if (existingLocations.length > 0) {
            locationId = existingLocations[0].location_id;
            console.log('Found existing location:', { locationId });
        } else {
            // Insert new location
            const [result] = await connection.execute(
                queries.addLocation,
                [
                    locationData.city_name,
                    locationData.country_code,
                    locationData.latitude,
                    locationData.longitude
                ]
            );
            locationId = result.insertId;
            isNewLocation = true;
            console.log('Created new location:', { locationId });
        }

        // Get current max display order
        const [orderRows] = await connection.execute(
            'SELECT COALESCE(MAX(display_order), -1) as max_order FROM user_favorite_locations WHERE user_id = ?',
            [userId]
        );
        const nextOrder = orderRows[0].max_order + 1;

        // Add to favorites
        await connection.execute(
            queries.addFavorite,
            [userId, locationId, nextOrder]
        );

        await connection.commit();

        // If this is a new location, trigger the fetch Lambda
        if (isNewLocation) {
            try {
                await lambda.invoke({
                    FunctionName: process.env.WEATHER_APP_FETCH_LAMBDA,
                    InvocationType: 'Event', // Async invocation
                    Payload: JSON.stringify({
                        locationId,
                        city: locationData.city_name,
                        country: locationData.country_code,
                        latitude: locationData.latitude,
                        longitude: locationData.longitude
                    })
                }).promise();
                console.log('Triggered weather fetch for new location:', locationId);
            } catch (error) {
                console.error('Failed to trigger weather fetch:', error);
                // Don't throw - we still want to return the locationId even if fetch fails
            }
        }
        
        return locationId;
    } catch (error) {
        console.error('Error in addLocationToDb:', error);
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
        
        // Check if location is still referenced by any user
        const [rows] = await connection.execute(
            'SELECT COUNT(*) as count FROM user_favorite_locations WHERE location_id = ?',
            [locationId]
        );

        if (rows[0].count === 0) {
            // Delete all related weather data
            await connection.execute('DELETE FROM hourly_forecasts WHERE location_id = ?', [locationId]);
            await connection.execute('DELETE FROM weather_forecasts WHERE location_id = ?', [locationId]);
            await connection.execute('DELETE FROM weather_cache WHERE location_id = ?', [locationId]);
            await connection.execute('DELETE FROM locations WHERE location_id = ?', [locationId]);
        }
        
        // Reorder remaining locations
        const [remainingLocations] = await connection.execute(
            'SELECT location_id FROM user_favorite_locations WHERE user_id = ? ORDER BY display_order ASC',
            [userId]
        );

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
    updateLocationOrderInDb
};