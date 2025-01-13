const {
    getUserLocationsFromDb,
    addLocationToDb,
    removeLocationFromDb,
    updateLocationOrderInDb,
    getMaxDisplayOrderForUserFromDb
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
        // Get the next display order for the user
        const maxDisplayOrder = await getMaxDisplayOrderForUserFromDb(userId);
        const nextDisplayOrder = maxDisplayOrder + 1;

        // Add the location with the next display order
        const locationId = await addLocationToDb(userId, {
            ...locationData,
            display_order: nextDisplayOrder
        });

        return {
            location_id: locationId,
            ...locationData,
            display_order: nextDisplayOrder
        };
    } catch (error) {
        console.error('Error adding location:', error);
        throw error;
    }
};

const removeLocation = async (userId, locationId) => {
    try {
        // Remove the location
        await removeLocationFromDb(userId, locationId);

        // Reorder remaining locations
        const remainingLocations = await getUserLocationsFromDb(userId);
        
        // Update display order for remaining locations
        const reorderedLocations = remainingLocations
            .sort((a, b) => a.display_order - b.display_order)
            .map((location, index) => ({
                ...location,
                display_order: index
            }));

        // Batch update display orders
        for (const location of reorderedLocations) {
            await updateLocationOrderInDb(
                userId, 
                location.location_id, 
                location.display_order
            );
        }

        return {
            message: 'Location removed successfully'
        };
    } catch (error) {
        console.error('Error removing location:', error);
        throw error;
    }
};

const updateLocationOrder = async (userId, locationOrder) => {
    try {
        // Validate input
        if (!Array.isArray(locationOrder)) {
            throw new Error('Location order must be an array of location IDs');
        }

        // Batch update location orders
        for (let i = 0; i < locationOrder.length; i++) {
            await updateLocationOrderInDb(userId, locationOrder[i], i);
        }

        return {
            message: 'Location order updated successfully'
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