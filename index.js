const Request = require('request'),
    rp = require('request-promise'),
    csv = require('csv-parser'),
    fs = require('fs'),
    client_id = process.env.CLIENT_ID,
    credentials = process.env.SF_USER+':'+process.env.SF_PASS+':'+process.env.CLIENT_PASS,
    host = process.env.INSTANCE,
    shopAPI = 's/LSS/dw/shop/v18_2',
    authURL = `${host}/dw/oauth2/access_token?client_id=${client_id}&grant_type=urn:demandware:params:oauth:grant-type:client-id:dwsid:dwsecuretoken`,
    buff = Buffer.from(credentials),
    credentialsBase64Encoded = buff.toString('base64');

let accessToken,
    tokenTimeStamp;

// set access token
const getAccessToken = () => {
    Request.post({
        'headers': {
            'content-type': 'application/x-www-form-urlencoded',
            'Authorization':`Basic ${credentialsBase64Encoded}`,
            'Connection': 'keep-alive'
        },
        'url': authURL
    }, (error, response, body) => {
        if(error) {
            return console.dir(error);
        }
        accessToken = JSON.parse(body).access_token;
        tokenTimeStamp = new Date().getTime();
        parseCSV();
    });
}

const parseCSV = () => {
    let arr = [];
    fs.createReadStream('orders.csv')
        .pipe(csv())
        .on('data', (data) => {
            arr.push(data.order);
        })
        .on('error', (error) => {
            console.log(`Error reading CSV file: ${error}`);
        })
        .on('end', async () => {
            for (const [i, orderID] of arr.entries()) {
                console.log(i, orderID);
                await retrieveOrderNotes(orderID);
            }
        });
}

/**
 * takes an order ID and returns an array of notes to be deleted
 * @param {String} orderID
 */
const retrieveOrderNotes = async (orderID) => {
    const url = `${host}/${shopAPI}/orders/${orderID}/notes`;
    console.log(url);
    let options =  {
        uri: url,
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    }

    await rp(options)
        .then(async (body) => {
            let notesArray = JSON.parse(body);
            if ('notes' in notesArray) {
                notesArray = notesArray.notes;
                await deleteOrderNote(orderID, notesArray);
            }
        }).catch((error) => {
            console.log(error);
        });
}

/**
 * takes an order ID and returns an array of notes to be deleted
 * @param {String} orderID
 */
const deleteOrderNote = async (orderID, notesArray) => {
    for (const [i, note] of notesArray.entries()) {
        let now = new Date().getTime(),
            diff = now-tokenTimeStamp;
        //refresh token every 10 mins
        if(diff > 600000) {
            getAccessToken();
        }

        // Leave first 10 notes
        if (i < 10) {
            continue;
        } else {
            const noteID = note.id;
            const url = `${host}/${shopAPI}/orders/${orderID}/notes/${noteID}`;
            let options =  {
                method: 'DELETE',
                uri: url,
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
            await rp(options)
                .then((body) => {
                    // console.log(`Note ID ${noteID} for order ${orderID} has been deleted.`);
                })
                .catch((error) => {
                    console.log('Error deleting note: '+JSON.parse(error).body)
                });
        }
    }
}

getAccessToken();
