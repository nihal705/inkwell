using InkWell.Api.Services;
using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;

namespace InkWell.Api.Controllers;

public class ContactDto
{
    [Required] public string Name { get; set; } = "";
    [Required, EmailAddress] public string Email { get; set; } = "";
    [Required, MinLength(10)] public string Message { get; set; } = "";
}

[ApiController, Route("api/contact")]
public class ContactController(IEmailService emailService) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> SendMessage([FromBody] ContactDto request)
    {
        if (!ModelState.IsValid) return BadRequest(new { message = "Please fill all fields correctly." });

        var adminEmail = Environment.GetEnvironmentVariable("ADMIN_EMAIL") ?? "admin@inkwell.local";
        
        var body = $"New message from InkWell Contact Form:\n\n" +
                   $"Name: {request.Name}\n" +
                   $"Email: {request.Email}\n\n" +
                   $"Message:\n{request.Message}";

        try
        {
            // Uses your existing EmailJS service to send to the Admin
            await emailService.SendOtpEmailAsync(adminEmail, body);
            return Ok(new { message = "Message sent successfully." });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Contact form error: {ex.Message}");
            return StatusCode(500, new { message = "Could not send message. Try again later." });
        }
    }
}