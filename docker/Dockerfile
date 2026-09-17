# Use the official Node.js image as a parent image
FROM public.ecr.aws/lambda/nodejs:18

# Set the working directory
WORKDIR /var/task

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your application code
COPY . .

# Build the NestJS application
RUN npm run build

# Command to run your application
CMD ["dist/lambda.handler"]