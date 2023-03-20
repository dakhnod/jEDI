const jsonata = require('jsonata');
const fs = require('fs');

(async () => {
    const files = []

    let http_args_default = {
        method: 'GET'
    }

    const bindings = {
        http_default_args_set: (args) => http_args_default = args,
        http_request: (args) => {
            args = Object.assign(http_args_default, args)
        },
        db_row_exists: (table, cols) => true,
        db_row_create: (table, cols) => true,
    }

    const parseFile = (files, value={}) => {
        if(files.length == 0) return

        const content = fs.readFileSync(files[0], 'utf8');
        const expression = jsonata(content)

        const result = jsonata.evaluate(value, bindings)

        return parseFile(files.slice(1))
    }

    parseFile(files[0])
})()