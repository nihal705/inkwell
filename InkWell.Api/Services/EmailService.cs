using System.Net.Http.Json;

namespace InkWell.Api.Services;

public interface IEmailService
{
    Task SendOtpEmailAsync(string toEmail, string otpCode, string? templateType = null);
}

public class EmailJsService : IEmailService
{
    private readonly HttpClient _http;
    private readonly IConfiguration _config;

    public EmailJsService(HttpClient http, IConfiguration config)
    {
        _http = http;
        _config = config;
    }

    public async Task SendOtpEmailAsync(string toEmail, string otpCode, string? templateType = null)
    {
        var serviceId  = Environment.GetEnvironmentVariable("EMAILJS_SERVICE_ID")  ?? _config["EmailJS:ServiceId"];
        
        // Use dedicated EMAILJS_REGISTER_TEMPLATE_ID if templateType is register, otherwise fallback to EMAILJS_TEMPLATE_ID
        var templateId = (templateType == "register" 
            ? Environment.GetEnvironmentVariable("EMAILJS_REGISTER_TEMPLATE_ID") 
            : null)
            ?? Environment.GetEnvironmentVariable("EMAILJS_TEMPLATE_ID") 
            ?? _config["EmailJS:TemplateId"];

        var publicKey  = Environment.GetEnvironmentVariable("EMAILJS_PUBLIC_KEY")  ?? _config["EmailJS:PublicKey"];
        var privateKey = Environment.GetEnvironmentVariable("EMAILJS_PRIVATE_KEY") ?? _config["EmailJS:PrivateKey"];

        if (string.IsNullOrWhiteSpace(serviceId) || string.IsNullOrWhiteSpace(privateKey))
            throw new InvalidOperationException("EmailJS configuration is missing.");

        var payload = new
        {
            service_id  = serviceId,
            template_id = templateId,
            user_id     = publicKey,
            accessToken = privateKey,
            template_params = new
            {
                to_email = toEmail,
                otp_code = otpCode,
                subject = templateType == "register" ? "Your InkWell Verification Code" : "Reset Your InkWell Password",
                purpose = templateType == "register" ? "account verification" : "password reset"
            }
        };

        var response = await _http.PostAsJsonAsync(
            "https://api.emailjs.com/api/v1.0/email/send", payload);

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync();
            throw new Exception($"EmailJS failed: {response.StatusCode} - {body}");
        }
    }
}
