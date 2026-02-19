# NexusMods Upload GitHub Action

# THE API USED HERE IS CURRENTLY FOR EVALUATION ONLY

This GitHub Action uploads a file to NexusMods using the NexusMods v3 API. It is designed to automate the process of uploading mod files as part of your CI/CD workflow.

## Features

- Uploads a file to NexusMods

## Inputs

| Name             | Description                                        | Required | Default  |
| ---------------- | -------------------------------------------------- | -------- | -------- |
| api_key          | API key                                            | Yes      |          |
| file_id          | File ID on Nexus Mods                              | Yes      |          |
| game_domain_name | Game Domain Name on Nexus Mods                     | Yes      |          |
| filename         | Name of the zip file to upload                     | Yes      |          |
| version          | Version string for the uploaded file (e.g., 1.0.0) | Yes      |          |
| display_name     | Display name for the uploaded file                 | No       | filename |
| file_category    | File category for the uploaded file                | No       | main     |

## Outputs

| Name     | Description                                |
| -------- | ------------------------------------------ |
| file_uid | The UID of the uploaded file on Nexus Mods |

## Usage

First, use another action to create a zip file. Then, use this action to upload the zip file to NexusMods:

## Example

```yaml
- name: Zip files
  run: zip -r my-mod.zip ./dist

- name: Upload to NexusMods
  uses: Nexus-Mods/upload-action@<tag>
  with:
    api_key: ${{ secrets.NEXUSMODS_API_KEY }}
    file_id: <file_id>
    game_domain_name: <game_domain_name>
    filename: my-mod.zip
    version: 1.0.0
    file_category: main # optional
```

## Development

### Requirements

This project requires Node v20 or higher

### Running locally

First run `npm install`, then create a `.env` file with the following required environment variables:

- `INPUT_API_KEY`
- `INPUT_FILE_ID`
- `INPUT_GAME_DOMAIN_NAME`
- `INPUT_FILENAME`
- `INPUT_VERSION`

Optional environment variables:

- `INPUT_DISPLAY_NAME`
- `INPUT_FILE_CATEGORY`
- `NEXUSMODS_API_BASE` - Override the API base URL (defaults to `https://api.nexusmods.com/v3`)
- `ACTIONS_STEP_DEBUG=true` - Enable debug output

Then run `npm run local-action` to build and run the action locally.

Before committing you must build the project with `npm run build`.

### OpenAPI schema

This is generated using openapi-typescript via the following command:

`npm run openapi-spec`

## License

MIT
