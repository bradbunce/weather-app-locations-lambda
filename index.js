// Only use dotenv in development
if (process.env.NODE_ENV === "development") {
    require("dotenv").config();
  }

const jwt = require('jsonwebtoken');
const {
    addLocation,
    removeLocation,
    getUserLocations,
    updateLocationOrder
} = require('./locationProcessor');

// Create response with CORS headers
const createResponse = (statusCode, body) => ({
    statusCode,
    headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': process.env.REACT_APP_ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,DELETE',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Credentials': 'true'
    },
    body: JSON.stringify(body)
});

const verifyToken = (authHeader) => {
    console.log('Full Authorization Header:', authHeader);
    console.log('Environment Variables:', {
        JWT_SECRET_EXISTS: !!process.env.JWT_SECRET,
        JWT_SECRET_LENGTH: process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 'N/A'
    });

    if (!authHeader) {
        console.log('No Authorization header provided');
        throw new Error('No token provided');
    }

    // Handle case-sensitivity and ensure proper Bearer format
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch) {
        console.log('Invalid Authorization header format');
        console.log('Attempted header:', authHeader);
        throw new Error('Invalid token format');
    }

    const token = tokenMatch[1];
    console.log('Extracted token (first 20 chars):', token.substring(0, 20));

    if (!process.env.JWT_SECRET) {
        console.error('JWT_SECRET environment variable NOT SET');
        throw new Error('Server configuration error: Missing JWT_SECRET');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Token decoded successfully:', {
            userId: decoded.userId,
            username: decoded.username
        });
        return decoded;
    } catch (error) {
        console.error('Token verification FAILED:', {
            errorName: error.name,
            errorMessage: error.message
        });
        throw error;
    }
};

exports.handler = async (event) => {
    // Enhanced logging for ALL events
    console.log('FULL EVENT DETAILS:', JSON.stringify({
        method: event.httpMethod,
        path: event.path,
        headers: event.headers,
        body: event.body,
        queryStringParameters: event.queryStringParameters
    }, null, 2));

    // Comprehensive CORS headers
    const createResponse = (statusCode, body) => {
        const origin = process.env.REACT_APP_ALLOWED_ORIGIN || '*';
        
        console.log('CORS Configuration:', {
            allowedOrigin: origin,
            method: event.httpMethod
        });

        return {
            statusCode,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,DELETE',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,x-requested-with',
                'Access-Control-Allow-Credentials': 'true',
                'Vary': 'Origin'
            },
            body: JSON.stringify(body)
        };
    };

    // Handle OPTIONS requests explicitly
    if (event.httpMethod === 'OPTIONS') {
        console.log('Handling CORS Preflight Request');
        return createResponse(204, {});
    }

    try {
        // Verify JWT token with enhanced logging
        const user = verifyToken(event.headers.Authorization);
        console.log('Authenticated User:', {
            userId: user.userId,
            username: user.username
        });

        const { path, httpMethod, body } = event;
        const requestBody = body ? JSON.parse(body) : {};

        console.log('Processing Request:', {
            method: httpMethod,
            path: path,
            userId: user.userId,
            username: user.username,
            requestBody
        });

        switch (`${httpMethod} ${path}`) {
            case 'GET /locations':
                const locations = await getUserLocations(user.userId);
                return createResponse(200, locations);
            
            case 'POST /locations':
                console.log('Attempting to add location:', requestBody);
                const newLocation = await addLocation(user.userId, requestBody);
                console.log('Location added successfully:', newLocation);
                return createResponse(201, newLocation);
            
                case 'DELETE /locations/{id}':
                    console.log('DELETE location request:', {
                      pathParams: event.pathParameters,
                      userId: user.userId,
                      locationId: event.pathParameters?.id,
                      routeKey: event.routeKey
                    });
                  
                    const locationId = event.pathParameters.id;
                    
                    // Convert the string ID to number to match location_id type
                    const numericLocationId = parseInt(locationId, 10);
                    
                    try {
                      await removeLocation(user.userId, numericLocationId);
                      return createResponse(200, { message: 'Location deleted successfully' });
                    } catch (err) {
                      console.error('Error in location deletion:', {
                        error: err.message,
                        userId: user.userId,
                        locationId: numericLocationId
                      });
                      return createResponse(500, { message: 'Failed to delete location' });
                    }
            
            case 'PUT /locations/order':
                await updateLocationOrder(user.userId, requestBody.locationOrder);
                return createResponse(200, { message: 'Location order updated successfully' });
            
                default:
                    console.log('No matching route found for:', `${httpMethod} ${path}`);
                    return createResponse(404, { message: 'Not Found' });
            }
        } catch (error) {
            console.error('DETAILED ERROR PROCESSING:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
    
            if (error.message === 'No token provided' || 
                error.message === 'Invalid token format' || 
                error.name === 'JsonWebTokenError') {
                return createResponse(401, { 
                    message: 'Unauthorized: Invalid Token',
                    details: error.message 
                });
            }
    
            if (error.name === 'TokenExpiredError') {
                return createResponse(401, { 
                    message: 'Token Expired' 
                });
            }
    
            return createResponse(500, { 
                message: 'Internal Server Error',
                details: error.message 
            });
        }
    };