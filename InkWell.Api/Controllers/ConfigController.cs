using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace InkWell.Api.Controllers;

[ApiController, Route("api/config")]
public class ConfigController : ControllerBase
{
    [HttpGet, AllowAnonymous]
    public IActionResult Get()
    {
        var cloudName = Environment.GetEnvironmentVariable("CLOUDINARY_CLOUD_NAME") ?? "";
        var uploadPreset = Environment.GetEnvironmentVariable("CLOUDINARY_UPLOAD_PRESET") ?? "";
        return Ok(new { cloudinary = new { cloudName, uploadPreset } });
    }
}