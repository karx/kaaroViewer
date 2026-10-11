import { request } from '../node_modules/request/request.js';

module.exports = async (value) => 
    new Promise((resolve, reject) => {
        request(value, (error, response, data) => {
            if(error) reject(error)
            else resolve(data)
        })
    })