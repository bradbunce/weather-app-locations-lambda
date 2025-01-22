const {
    getUserLocationsFromDb,
    addLocationToDb,
    removeLocationFromDb,
    updateLocationOrderInDb
} = require('./database');

const getUserLocations = async (userId) => {
    try {
        const locations = await getUserLocationsFromDb(userId);
        return locations;
    } catch (error) {
        console.error('Error getting user locations:', error);
        throw error;
    }
};

const addLocation = async (userId, locationData) => {
    try {
        console.log('Processing location addition:', {
            userId,
            locationData
        });
        
        const locationId = await addLocationToDb(userId, locationData);
        
        return {
            location_id: locationId,
            ...locationData
        };
    } catch (error) {
        console.error('Error adding location:', {
            error: error.message,
            userId,
            locationData
        });
        throw error;
    }
};

const removeLocation = async (userId, locationId) => {
    try {
        await removeLocationFromDb(userId, locationId);
        return {
            message: 'Location removed successfully'
        };
    } catch (error) {
        console.error('Error removing location:', {
            error: error.message,
            userId,
            locationId
        });
        throw error;
    }
};

const updateLocationOrder = async (userId, locationOrder) => {
    try {
        if (!Array.isArray(locationOrder)) {
            throw new Error('Location order must be an array of location IDs');
        }

        await updateLocationOrderInDb(userId, locationOrder);
        
        return {
            message: 'Location order updated successfully'
        };
    } catch (error) {
        console.error('Error updating location order:', {
            error: error.message,
            userId,
            locationOrder
        });
        throw error;
    }
};

module.exports = {
    getUserLocations,
    addLocation,
    removeLocation,
    updateLocationOrder
};