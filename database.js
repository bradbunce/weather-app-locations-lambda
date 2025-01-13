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
        const [rows] = await connection.execute(
            'SELECT COALESCE(MAX(display_order), -1) AS max_order FROM user_locations WHERE user_id = ?', 
            [userId]
        );
        return rows[0].max_order;
    } finally {
        await connection.end();
    }
};

const addLocationToDb = async (userId, locationData) => {
    const connection = await createConnection('write');
    try {
        // If no display order is provided, get the next order
        const displayOrder = locationData.display_order !== undefined 
            ? locationData.display_order 
            : await getMaxDisplayOrderForUserFromDb(userId) + 1;

        const [result] = await connection.execute(
            queries.addLocation,
            [
                userId,
                locationData.city_name || locationData.cityName,
                locationData.country_code || locationData.countryCode,
                locationData.latitude,
                locationData.longitude,
                displayOrder
            ]
        );
        return result.insertId;
    } finally {
        await connection.end();
    }
};

const removeLocationFromDb = async (userId, locationId) => {
    const connection = await createConnection('write');
    try {
        await connection.beginTransaction();

        // Remove the specified location
        await connection.execute(queries.removeLocation, [userId, locationId]);

        // Fetch remaining locations to re-order
        const [remainingLocations] = await connection.execute(
            'SELECT location_id FROM user_locations WHERE user_id = ? ORDER BY display_order ASC', 
            [userId]
        );

        // Re-assign display orders
        for (let i = 0; i < remainingLocations.length; i++) {
            await connection.execute(
                'UPDATE user_locations SET display_order = ? WHERE location_id = ?', 
                [i, remainingLocations[i].location_id]
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