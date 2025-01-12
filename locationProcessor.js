const {
    getUserLocationsFromDb,
    addLocationToDb,
    removeLocationFromDb,
    updateLocationOrderInDb
} = require('./database');

const getUserLocations = async (userId) => {
    try {
        const locations = await getUserLocationsFromDb(userId);
        return {
            statusCode: 200,
            body: JSON.stringify(locations)
        };
    } catch (error) {
        console.error('Error getting user locations:', error);
        throw error;
    }
};

const addLocation = async (userId, locationData) => {
    try {
        const locationId = await addLocationToDb(userId, locationData);
        return {
            statusCode: 201,
            body: JSON.stringify({
                message: 'Location added successfully',
                locationId
            })
        };
    } catch (error) {
        console.error('Error adding location:', error);
        throw error;
    }
};

const removeLocation = async (userId, locationId) => {
    try {
        await removeLocationFromDb(userId, locationId);
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Location removed successfully'
            })
        };
    } catch (error) {
        console.error('Error removing location:', error);
        throw error;
    }
};

const updateLocationOrder = async (userId, locationOrder) => {
    try {
        await updateLocationOrderInDb(userId, locationOrder);
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Location order updated successfully'
            })
        };
    } catch (error) {
        console.error('Error updating location order:', error);
        throw error;
    }
};

module.exports = {
    getUserLocations,
    addLocation,
    removeLocation,
    updateLocationOrder
};