const AWS = require('aws-sdk');
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const mime = require('mime-types');
require("dotenv").config();

const sendEmail = async (event) => {
  // taking what's coming in the body
  const { addresses, subject, body, attachments } = JSON.parse(event.body);

  // Configuring AWS
  AWS.config.update({
    accessKeyId: process.env.ACCESS_KEY,
    secretAccessKey: process.env.SECRET_KEY,
    region: 'us-east-1',
  });

  try {

    if (!addresses || !subject || !body) {
      console.error("Email Parameters Not Complete");
      throw new Error(`Email Parameters not Complete`)
    }
    // Using AWS SES (simple email service) for sending the email
    const mainTransporter = nodemailer.createTransport({
      SES: new AWS.SES({ apiVersion: '2010-12-01' }),
    });

    const attachmentPromises = attachments.map(async (attachment) => {
      // check if the file exists before attempting to read it
      const exists = await fileExists(attachment.path);

      if (!exists) {
        console.error(`File not found: ${attachment.path}`);
        throw new Error(`File not found: ${attachment.path}`);
      }

      const content = await readFile(attachment.path);
      // determining the file type
      const contentType = mime.lookup(attachment.path) || 'application/octet-stream';

      return {
        filename: attachment.filename || 'attachment.txt',
        content: content.toString('base64'), // encoding of attachment files data
        encoding: 'base64', // overall encoding
        contentType: contentType,
      };
    });

    const attachmentContents = await Promise.all(attachmentPromises);

    const mailOptions = {
      from: process.env.SENDER_EMAIL,
      to: addresses.join(', '),
      subject: subject,
      html: body,
      text: body,
      attachments: attachmentContents,
    };
    // sending the email
    await mainTransporter.sendMail(mailOptions);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Email sent successfully!',
      }),
    };
  } catch (error) {
    // If there is an error, send a notification email
    const errorTransporter = nodemailer.createTransport({
      SES: new AWS.SES({ apiVersion: '2010-12-01' }),
    });

    const errorMailOptions = {
      from: process.env.SENDER_EMAIL,
      to: addresses.join(', '),
      subject: 'Error Sending Email Notification',
      text: `Due to technical error, the intended email was not being successfully sent`,
      html: `Due to technical error, the intended email was not being successfully sent`,
    };

    await errorTransporter.sendMail(errorMailOptions);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error sending email',
        error: error.message || error,
      }),
    };
  }
};

// reading file
const readFile = async (path) => {
  try {
    return await fs.readFile(path);
  } catch (error) {
    console.error('Error reading file:', error);
    throw error;
  }
};

// check if the attachment paths are correct
const fileExists = async (path) => {
  try {
    await fs.access(path);
    return true;
  } catch (error) {
    return false;
  }
};

module.exports = {
  handler: sendEmail,
};

// aws logs tail /aws/lambda/SendEmail1-dev-api  -> for getting AWS log details
