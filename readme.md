# Password Manager

Probably not a good idea to use this. Was just curious about how to make one. Gonna stick with a password manager I dont have to manage for now.

## Example Usage

This app assumes you are storing passwords in a DynamoDB table. Here is how you run node files in a terminal:

```bash
DB=MY_DB_NAME node getPassword.mjs
DB=MY_DB_NAME node listServices.mjs
DB=MY_DB_NAME node makePassword.mjs
DB=MY_DB_NAME node setPassword.mjs
```
