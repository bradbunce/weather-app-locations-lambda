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

const ALLOWED_ORIGIN = process.env.REACT_APP_ALLOWED_ORIGIN;

// Create response with CORS headers
const createResponse = (statusCode, body) => ({
    statusCode,
    headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,DELETE',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Credentials': 'true'
    },
    body: JSON.stringify(body)
});

const verifyToken = (authHeader) => {
    if (!authHeader) {
        throw new Error('No token provided');
    }
    
    // Handle case-sensitivity of headers
    const token = authHeader.replace(/^Bearer\s+/i, '');
    return jwt.verify(token, process.env.JWT_SECRET);
};

exports.handler = async (event) => {
    // Handle OPTIONS requests for CORS
    if (event.httpMethod === 'OPTIONS') {
        return createResponse(204, {});
    }

    try {
        console.log('Event received:', {
            method: event.httpMethod,
            path: event.path,
            headers: event.headers
        });

        // Verify JWT token
        const authHeader = event.headers.Authorization || event.headers.authorization;
        const user = verifyToken(authHeader);

        const { path, httpMethod, body } = event;
        const requestBody = body ? JSON.parse(body) : {};

        // Log parsed request details
        console.log('Request details:', {
            method: httpMethod,
            path: path,
            userId: user.userId
        });

        switch (`${httpMethod} ${path}`) {
            case 'GET /locations':
            case 'GET /users/${user.username}/locations':
                const locations = await getUserLocations(user.userId);
                return createResponse(200, locations);

            case 'POST /locations':
            case 'POST /users/${user.username}/locations':
                const newLocation = await addLocation(user.userId, requestBody);
                return createResponse(201, newLocation);

            case 'DELETE /locations/{id}':
            case 'DELETE /users/${user.username}/locations/{id}':
                const locationId = event.pathParameters.id;
                await removeLocation(user.userId, locationId);
                return createResponse(200, { message: 'Location deleted successfully' });

            case 'PUT /locations/order':
            case 'PUT /users/${user.username}/locations/order':
                await updateLocationOrder(user.userId, requestBody.locationOrder);
                return createResponse(200, { message: 'Location order updated successfully' });

            default:
                console.log('No matching route found for:', `${httpMethod} ${path}`);
                return createResponse(404, { message: 'Not Found' });
        }
    } catch (error) {
        console.error('Error:', error);
        
        if (error.message === 'No token provided' || error.name === 'JsonWebTokenError') {
            return createResponse(401, { message: 'Unauthorized' });
        }

        return createResponse(500, { message: 'Internal server error' });
    }
};