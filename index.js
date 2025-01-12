if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const jwt = require('jsonwebtoken');
const { 
    addLocation,
    removeLocation,
    getUserLocations,
    updateLocationOrder
} = require('./locationProcessor');

const verifyToken = (authHeader) => {
    if (!authHeader) {
        throw new Error('No token provided');
    }
    const token = authHeader.replace('Bearer ', '');
    return jwt.verify(token, process.env.JWT_SECRET);
};

exports.handler = async (event) => {
    try {
        // Verify JWT token
        const user = verifyToken(event.headers.Authorization);
        const { path, httpMethod, body } = event;
        const requestBody = body ? JSON.parse(body) : {};

        switch (`${httpMethod} ${path}`) {
            case 'GET /locations':
                return await getUserLocations(user.userId);

            case 'POST /locations':
                return await addLocation(user.userId, requestBody);

            case 'DELETE /locations/{id}':
                const locationId = event.pathParameters.id;
                return await removeLocation(user.userId, locationId);

            case 'PUT /locations/order':
                return await updateLocationOrder(user.userId, requestBody.locationOrder);

            default:
                return {
                    statusCode: 404,
                    body: JSON.stringify({ message: 'Not Found' })
                };
        }
    } catch (error) {
        console.error('Error:', error);
        if (error.message === 'No token provided' || error.name === 'JsonWebTokenError') {
            return {
                statusCode: 401,
                body: JSON.stringify({ message: 'Unauthorized' })
            };
        }
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal server error' })
        };
    }
};