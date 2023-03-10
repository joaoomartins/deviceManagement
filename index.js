const express = require('express');
const cors = require('cors');
const axios = require('axios');
const moment = require('moment');
const cron = require('cron');

const hostname = '127.0.0.1';
const port = 8080;

const Pool = require('pg').Pool
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'sensors',
    password: 'postgres',
    port: 5432,
})

const app = express();

app.use(express.json());
app.use(cors())


app.get('/devices', (req, res) => {
    pool.query('SELECT * FROM devices ORDER BY id ASC', (error, results) => {
        if (error) {
            throw error;
        }
        if (results.rows.length) {
            console.log(results)
            res.status(200).json(results.rows);
        }
        else
            res.sendStatus(404);
    })
});

app.get('/devices/:id', (req, res) => {
    var id = req.params.id
    pool.query('SELECT * FROM devices WHERE id = $1', [id], (error, results) => {
        if (error) {
            throw error;
        }
        if (results.rows.length) {
            console.log(results)
            res.status(200).json(results.rows[0]);
        }
        else
            res.sendStatus(404);
    })
});

app.get('/devices/:id/values/:offset/', (req, res) => {
    var id = req.params.id
    var offset = req.params.offset
    pool.query('SELECT * FROM readings r WHERE deviceId = $1 ORDER BY r.date ASC limit 10 offset $2', [id, offset], (error, results) => {
        if (error) {
            throw error;
        }
        if (results.rows.length) {
            console.log(results)
            res.status(200).json(results.rows);
        }
        else
            res.sendStatus(404);
    })
});

app.post('/devices', (req, res) => {
    const name = req.body.name
    const lat = parseFloat(req.body.lat)
    const lon = parseFloat(req.body.lon)

    pool.query('INSERT INTO devices (name, lat, lon) VALUES ($1, $2, $3) RETURNING *'
        , [name, lat, lon], function (error, results) {
            if (error) {
                throw error;
            }
            if (results.rows.length) {
                console.log(results)
                res.status(200).json(results.rows);
            }
        })
})

app.put('/devices/:id', (req, res) => {
    var id = req.params.id
    const name = req.body.name
    const lat = parseFloat(req.body.lat)
    const lon = parseFloat(req.body.lon)

    pool.query('UPDATE devices SET name = $1, lat = $2, lon = $3 WHERE id = $4 RETURNING id',
        [name, lat, lon, id], (error, results) => {
            if (error) {
                throw error;
            }
            if (results.rows.length) {

                res.status(200).json(results.rows[0]);
            }
            else
                res.sendStatus(404);
        })
})

app.delete('/delete', (req, res) => {
    var id = req.body.id;
    console.log(id);

    Promise.all([
        pool.query('DELETE FROM readings WHERE readings.deviceid = $1', [id]),
        pool.query('DELETE FROM devices WHERE devices.id = $1', [id])
    ])
    .then((results) => {
        console.log('DELETE successful');
        res.status(200).json({ message: 'Device deleted successfully' });
    })
    .catch((error) => {
        console.error(error);
        res.status(500).json({ message: 'Error deleting device' });
    });
});

var date = new Date();
var start_date = moment(date).subtract(1, 'days').format('YYYY-MM-DD');
var end_date = moment(date).format('YYYY-MM-DD');

const job = new cron.CronJob('*/1 * * * *', function () {
    pool.query('SELECT * FROM devices ORDER BY id ASC', (error, results) => {
        if (error) {
            throw error;
        }
        if (results.rows.length) {

            results.rows.forEach(result => {
                console.log(result);
            })
        }
    })

});



job.start();

pool.query('SELECT * FROM devices ORDER BY id ASC', (error, results) => {
    if (error) {
        throw error;
    }
    if (results.rows.length) {

        results.rows.forEach(result => {
            axios.get(
                'https://api.open-meteo.com/v1/forecast?latitude=' + result.lat + '&longitude=' +
                result.lon + '&past_days=10&hourly=temperature_2m')
                .then(response => {
                    //console.log(response);


                    response.data.hourly.time.forEach(function (element, i) {

                        console.log(element);

                        pool.query('INSERT INTO readings(deviceId, date, value) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
                            [result.id, element, response.data.hourly.temperature_2m[i]], (error, results) => {
                                if (error) {
                                    throw error;
                                }
                                if (results.rows.length) {
                                    console.log(results)
                                }
                            })


                    });

                })
                .catch(error => {
                    console.log(error);
                });
        })


    }
})

app.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
});