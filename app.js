import jsonata from 'jsonata';
import fs from 'fs';
import axios from 'axios';
import {default as AxiosDigestAuth} from '@mhoc/axios-digest-auth';
import { exec } from 'child_process';
import sqlite3 from 'sqlite3';
import { parseArgs } from 'node:util'

(async () => {
    const args = parseArgs({
        options: {
            database: {
                type: 'string'
            },
            files: {
                type: 'string',
                multiple: true,
            }
        }
    })

    if(args.values.files == undefined){
        throw "missing --files parameter"
    }
    const files = args.values.files

    let database = undefined

    if(args.values.database != undefined){
        database = new sqlite3.Database(args.values.database)
    }

    let http_args_default = {
        method: 'GET'
    }

    function bindings_to_selector(bindings){
        return Object.keys(bindings).map(key => key + '=?').join(' AND ')
    }

    function bindings_to_values(bindings){
        return Object.values(bindings)
    }

    function bindings_to_insert_values(bindings){
        return Array(Object.values(bindings).length).fill('?').join(',')
    }

    function assert_database_exists(){
        if(database == undefined){
            throw 'in order to use database specify --database argument'
        }
    }

    const bindings = 
    {
        core: {
            http: {
                default_opts: {},
                request: async (options) => {
                    let requester = axios
                    if(options.digest){
                        requester = new AxiosDigestAuth.default(options.digest)
                    }
                    try{
                        let response = await requester.request(options)

                        if(options.pagination){
                            const result = response.data.data

                            for(let current_page = 2; current_page <= response.data.pagination.page_last; current_page++){
                                const pagination = response.data.pagination

                                options.params = Object.assign({}, options.params, {page: current_page})

                                response = await requester.request(options)

                                result.push(...response.data.data)
                            }

                            response.data = result
                        }

                        return response
                    }catch(e){
                        console.error(e)
                    }
                }
            },
            'db': {
                table_assert: async (table, ...cols) => {
                    assert_database_exists()
                    const sql = `CREATE TABLE IF NOT EXISTS ${table}(${cols.join(',')})`
                    await new Promise((resolve, reject) => {
                        database.run(sql, (err) => {
                            if(err != null){
                                reject(err)
                                return
                            }
                            resolve()
                        })
                    })
                },
                row_exists: async (table, cols) => {
                    assert_database_exists()
                    const sql = `SELECT * FROM ${table} WHERE ${bindings_to_selector(cols)}`

                    const result = await new Promise((resolve, reject) => {
                        database.get(sql, bindings_to_values(cols), (err, row) => {
                            if(err != null){
                                reject(err)
                                return
                            }
                            resolve(row)
                        })
                    })
                    return result != undefined
                },
                row_create: async (table, cols) => {
                    assert_database_exists()
                    const sql = `INSERT INTO ${table}(${Object.keys(cols)}) VALUES (${bindings_to_insert_values(cols)})`

                    await new Promise((resolve, reject) => {
                        database.run(sql, bindings_to_values(cols), (err) => {
                            if(err != null){
                                reject(err)
                                return
                            }
                            resolve()
                        })
                    })
                },
                row_delete: async (table, cols) => {
                    assert_database_exists()
                    let sql = `DELETE FROM ${table}`
                    let values = undefined
                    if(cols != undefined){
                        sql += ` WHERE ${bindings_to_selector(cols)}`
                        values = bindings_to_values(cols)
                    }

                    await new Promise((resolve, reject) => {
                        database.run(sql, values, (err) => {
                            if(err != null){
                                reject(err)
                                return
                            }
                            resolve()
                        })
                    })
                }
            },
            'console': console
        }
    }

    const parseFile = async (files, value={}) => {
        if(files.length == 0) return value

        const content = fs.readFileSync(files[0], 'utf8');
        const expression = jsonata(content)

        const result = await expression.evaluate(value, bindings)

        return await parseFile(files.slice(1), result)
    }

    try{
        const result = await parseFile(files)
        console.log(result)
    }catch(e){
        console.log(e)
    }
})()